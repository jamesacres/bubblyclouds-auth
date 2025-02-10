import { randomBytes } from 'crypto';
import { Context } from 'koa';
import { koaBody as bodyParser } from 'koa-body';
import Router from 'koa-router';
import { getGoogleClient } from '../lib/google';
import { Client } from 'openid-client';
import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import { Account } from '../models/account';
import { IdentityProvider } from '../types/IdentityProvider';
import Provider, { errors } from 'oidc-provider';
import { constants } from 'http2';
import { render } from 'ejs';
import { repost } from '../views/repost';
import { AppConfig } from '../types/AppConfig';
import { login } from '../views/login';
import { getAppleClient } from '../lib/apple';
import jwt from 'jsonwebtoken';
import { Ses } from '../lib/ses';
import {
  signInEmailHtml,
  signInEmailSubject,
  signInEmailText,
} from '../views/signInEmail';
import { SignInCode } from '../lib/signInCode';

export interface OidcInteractionConfig {
  serverUrl: string;
  serverUrlProd?: string;
}

export const oidcInteraction = (
  provider: Provider,
  ses: Ses,
  signInCode: SignInCode,
  federatedClients: AppConfig['federatedClients'],
  { serverUrl, serverUrlProd }: OidcInteractionConfig
) => {
  // Federated Clients
  let _googleClient: Client;
  let _appleClient: Client;
  const googleClient = async () => {
    if (!_googleClient) {
      const callbackUrl = `${serverUrl}/oidc/interaction/callback/google`;
      _googleClient = await getGoogleClient(
        federatedClients.google.clientId,
        callbackUrl
      );
    }
    return _googleClient;
  };
  const appleClient = async () => {
    if (!_appleClient) {
      const clientSecret = jwt.sign(
        {
          iss: federatedClients.apple.teamId,
          aud: 'https://appleid.apple.com',
          sub: federatedClients.apple.clientId,
        },
        federatedClients.apple.privateKey,
        {
          algorithm: 'ES256',
          expiresIn: 15777000,
          header: {
            alg: 'ES256',
            kid: federatedClients.apple.keyId,
          },
        }
      );
      const callbackUrl = `${serverUrlProd || serverUrl}/oidc/interaction/callback/apple`;
      _appleClient = await getAppleClient(
        federatedClients.apple.clientId,
        clientSecret,
        callbackUrl
      );
    }
    return _appleClient;
  };

  // Parse bodies
  const body = bodyParser({
    text: false,
    json: false,
    patchNode: true,
    patchKoa: true,
  });

  // Setup interaction routes
  const router = new Router();

  router.use(async (ctx, next) => {
    ctx.set('cache-control', 'no-store');
    try {
      await next();
    } catch (e) {
      if (e?.status < constants.HTTP_STATUS_INTERNAL_SERVER_ERROR) {
        console.warn(e);
      } else {
        console.error(e);
      }
      console.trace(e);
      throw e;
    }
  });

  const interactionUid = async (ctx: Context, next) => {
    const { uid, params, prompt } = await provider.interactionDetails(
      ctx.req,
      ctx.res
    );
    if (prompt.name === 'login' && params.client_id) {
      const client = await provider.Client.find(<string>params.client_id);

      let email: string | undefined;
      if (ctx.request.body) {
        const { email: requestEmail, emailCode: requestEmailCode } = ctx.request
          .body as { email?: string; emailCode?: string };
        if (
          typeof requestEmail === 'string' &&
          requestEmail.includes('@') &&
          !requestEmail.includes('"')
        ) {
          email = requestEmail;

          if (requestEmailCode === undefined) {
            try {
              const code = await signInCode.getCode(email);
              await ses.sendEmail({
                html: signInEmailHtml(code),
                subject: signInEmailSubject,
                text: signInEmailText(code),
                toEmail: email,
              });
            } catch (e) {
              console.error(e);
            }
          } else {
            if (await signInCode.checkCode(email, requestEmailCode)) {
              console.info('Correct code for email', email);
              const account = await Account.findByIDP(IdentityProvider.EMAIL, {
                email,
                email_verified: true,
              });

              return provider.interactionFinished(
                ctx.req,
                ctx.res,
                {
                  login: {
                    accountId: account.accountId,
                    remember: true, // closing and reopening browser does not force new login
                  },
                },
                {
                  mergeWithLastSubmission: false,
                }
              );
            } else {
              console.warn('Invalid code for email', {
                email,
                requestEmailCode,
              });
            }
          }
        }
      }

      return (ctx.response.body = render(login(email), {
        uid,
        client,
      }));
      // // Caller will indicate which to login with, for now default to Google
      // return ctx.redirect(`/oidc/interaction/${uid}/federated/google`);
    } else if (prompt.name === 'consent') {
      throw Error('consent view not implemented');
    }
    return next();
  };
  router.get('/interaction/:uid', interactionUid);
  router.post('/interaction/:uid', body, interactionUid);

  router.get('/interaction/:uid/federated/google', body, async (ctx) => {
    const {
      prompt: { name },
    } = await provider.interactionDetails(ctx.req, ctx.res);
    if (name !== 'login') {
      throw Error('unexpected prompt');
    }

    const state = ctx.params.uid;
    const nonce = randomBytes(32).toString('hex');

    const nextPath = `/oidc/interaction/${ctx.params.uid}/federated`;
    ctx.cookies.set('google.nonce', nonce, {
      path: nextPath,
      sameSite: 'strict',
    });

    ctx.status = 303;
    return ctx.redirect(
      (await googleClient()).authorizationUrl({
        state,
        nonce,
        scope: 'openid email profile',
      })
    );
  });

  router.get('/interaction/:uid/federated/apple', body, async (ctx) => {
    const {
      prompt: { name },
    } = await provider.interactionDetails(ctx.req, ctx.res);
    if (name !== 'login') {
      throw Error('unexpected prompt');
    }

    const state = ctx.params.uid;
    const nonce = randomBytes(32).toString('hex');

    const nextPath = `/oidc/interaction/${ctx.params.uid}/federated`;
    ctx.cookies.set('apple.nonce', nonce, {
      path: nextPath,
      sameSite: 'strict',
    });

    ctx.status = 303;
    return ctx.redirect(
      (await appleClient()).authorizationUrl({
        state,
        nonce,
        scope: 'openid email',
        response_mode: 'form_post',
      })
    );
  });

  router.get('/interaction/callback/google', async (ctx: Context) => {
    // Callback page, will POST results to /interaction/:uid/federated
    const nonce = ctx.state.cspNonce;
    ctx.response.body = render(repost(), {
      nonce,
      layout: false,
      upstream: IdentityProvider.GOOGLE,
    });
  });

  router.post('/interaction/callback/apple', body, async (ctx: Context) => {
    // Callback page, will POST results to /interaction/:uid/federated
    const { state, code } = ctx.request.body || {};
    if (!(state && code)) {
      throw new errors.InvalidRequest('unexpected request');
    }
    const nonce = ctx.state.cspNonce;
    ctx.response.body = render(repost({ state, code }), {
      nonce,
      layout: false,
      upstream: IdentityProvider.APPLE,
    });
  });

  router.post('/interaction/:uid/federated', body, async (ctx) => {
    // callback from repost
    if (ctx.request.body?.upstream === IdentityProvider.GOOGLE) {
      const callbackParams = (await googleClient()).callbackParams(ctx.req);
      const nonce = ctx.cookies.get('google.nonce');
      const thisPath = `/oidc/interaction/${ctx.params.uid}/federated`;
      ctx.cookies.set('google.nonce', null, { path: thisPath });

      const getIdTokenClaims = async () => {
        try {
          const tokenset = await (
            await googleClient()
          ).callback(undefined, callbackParams, {
            nonce,
            state: ctx.params.uid,
            response_type: 'id_token',
          });
          const googleOAuth2Client = new GoogleOAuth2Client();
          await googleOAuth2Client.verifyIdToken({
            idToken: tokenset.id_token!,
            audience: federatedClients.google.clientId,
          });
          return tokenset.claims();
        } catch (e) {
          console.error(e);
          throw new errors.InvalidToken('invalid google id_token');
        }
      };

      const account = await Account.findByIDP(
        IdentityProvider.GOOGLE,
        await getIdTokenClaims()
      );

      return provider.interactionFinished(
        ctx.req,
        ctx.res,
        {
          login: {
            accountId: account.accountId,
            remember: true, // closing and reopening browser does not force new login
          },
        },
        {
          mergeWithLastSubmission: false,
        }
      );
    }

    if (ctx.request.body?.upstream === IdentityProvider.APPLE) {
      const callbackParams = (await appleClient()).callbackParams(ctx.req);
      const nonce = ctx.cookies.get('apple.nonce');
      const thisPath = `/oidc/interaction/${ctx.params.uid}/federated`;
      ctx.cookies.set('apple.nonce', null, { path: thisPath });

      const getIdTokenClaims = async () => {
        try {
          const tokenset = await (
            await appleClient()
          ).callback(undefined, callbackParams, {
            nonce,
            state: ctx.params.uid,
            response_type: 'code',
          });
          return tokenset.claims();
        } catch (e) {
          console.error(e);
          throw new errors.InvalidToken('invalid apple id_token');
        }
      };

      const account = await Account.findByIDP(
        IdentityProvider.APPLE,
        await getIdTokenClaims()
      );

      return provider.interactionFinished(
        ctx.req,
        ctx.res,
        {
          login: {
            accountId: account.accountId,
            remember: true, // closing and reopening browser does not force new login
          },
        },
        {
          mergeWithLastSubmission: false,
        }
      );
    }

    throw new errors.InvalidRequest('unexpected request');
  });

  router.post('/interaction/:uid/confirm', body, async (ctx) => {
    const {
      prompt: { name },
    } = await provider.interactionDetails(ctx.req, ctx.res);
    if (name !== 'consent') {
      throw Error('unexpected prompt');
    }
    throw Error('confirm consent not implemented');
  });

  router.get('/interaction/:uid/abort', async (ctx) => {
    const result = {
      error: 'access_denied',
      error_description: 'End-User aborted interaction',
    };

    return provider.interactionFinished(ctx.req, ctx.res, result, {
      mergeWithLastSubmission: false,
    });
  });

  return router;
};

import { randomBytes } from 'crypto';
import { Context } from 'koa';
import { koaBody as bodyParser } from 'koa-body';
import Router from 'koa-router';
import { Account } from '../models/account';
import { IdentityProvider } from '../types/IdentityProvider';
import Provider, { errors } from 'oidc-provider';
import { constants } from 'http2';
import { render } from 'ejs';
import { repost } from '../views/repost';
import { login } from '../views/login';
import { Ses } from '../lib/ses';
import {
  signInEmailHtml,
  signInEmailSubject,
  signInEmailText,
} from '../views/signInEmail';
import { SignInCode } from '../lib/signInCode';
import { FederatedClients } from '../lib/federatedClients';

export const oidcInteraction = (
  provider: Provider,
  ses: Ses,
  signInCode: SignInCode,
  federatedClients: FederatedClients
) => {
  // Parse urlencoded bodies
  const body = bodyParser({
    text: false,
    json: false,
    urlencoded: true,
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
              const account = await Account.findByIDP(
                IdentityProvider.EMAIL,
                {
                  email,
                  email_verified: true,
                },
                undefined
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
      (await federatedClients.googleClient()).authorizationUrl({
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
      (await federatedClients.appleClient()).authorizationUrl({
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
      const callbackParams = (
        await federatedClients.googleClient()
      ).callbackParams(ctx.req);
      const nonce = ctx.cookies.get('google.nonce') || '';
      const thisPath = `/oidc/interaction/${ctx.params.uid}/federated`;
      ctx.cookies.set('google.nonce', null, { path: thisPath });

      const { claims, federatedTokens } =
        await federatedClients.googleIdTokenClaims(
          nonce,
          ctx.params.uid,
          callbackParams
        );
      const account = await Account.findByIDP(
        IdentityProvider.GOOGLE,
        claims,
        federatedTokens
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
      const callbackParams = (
        await federatedClients.appleClient()
      ).callbackParams(ctx.req);
      const nonce = ctx.cookies.get('apple.nonce') || '';
      const thisPath = `/oidc/interaction/${ctx.params.uid}/federated`;
      ctx.cookies.set('apple.nonce', null, { path: thisPath });

      const { claims, federatedTokens } =
        await federatedClients.appleIdTokenClaims(
          nonce,
          ctx.params.uid,
          callbackParams
        );
      const account = await Account.findByIDP(
        IdentityProvider.APPLE,
        claims,
        federatedTokens
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

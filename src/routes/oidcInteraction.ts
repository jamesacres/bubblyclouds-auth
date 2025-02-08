import { randomBytes } from 'crypto';
import { Context } from 'koa';
import { koaBody as bodyParser } from 'koa-body';
import Router from 'koa-router';
import { getGoogleClient } from '../lib/google';
import { Client } from 'openid-client';
import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import { Account } from '../models/account';
import { FederatedProvider } from '../types/FederatedProvider';
import Provider, { errors } from 'oidc-provider';
import { constants } from 'http2';
import { render } from 'ejs';
import { repost } from '../views/repost';
import { AppConfig } from '../types/AppConfig';
import { login } from '../views/login';
import { getAppleClient } from '../lib/apple';
import { sign } from 'jsonwebtoken';

export const oidcInteraction = (
  provider: Provider,
  serverUrl: string,
  federatedClients: AppConfig['federatedClients'],
  serverUrlProd?: string
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
      const clientSecret = sign(
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

  router.get('/interaction/:uid', async (ctx: Context, next) => {
    const { uid, params, prompt } = await provider.interactionDetails(
      ctx.req,
      ctx.res
    );
    if (prompt.name === 'login' && params.client_id) {
      const client = await provider.Client.find(<string>params.client_id);
      return (ctx.response.body = render(login, {
        uid,
        client,
      }));
      // // Caller will indicate which to login with, for now default to Google
      // return ctx.redirect(`/oidc/interaction/${uid}/federated/google`);
    } else if (prompt.name === 'consent') {
      throw Error('consent view not implemented');
    }
    return next();
  });

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
        // TODO need email here, but requires form post, so likely need to make /interaction/callback/apple handle post and figure out how to send that response mode param to apple
        scope: 'openid',
      })
    );
  });

  router.get('/interaction/callback/google', async (ctx: Context) => {
    // Callback page, will POST results to /interaction/:uid/federated
    const nonce = ctx.state.cspNonce;
    ctx.response.body = render(repost, {
      nonce,
      layout: false,
      upstream: FederatedProvider.GOOGLE,
    });
  });

  router.get('/interaction/callback/apple', async (ctx: Context) => {
    // Callback page, will POST results to /interaction/:uid/federated
    const nonce = ctx.state.cspNonce;
    ctx.response.body = render(repost, {
      nonce,
      layout: false,
      upstream: FederatedProvider.APPLE,
    });
  });

  router.post('/interaction/:uid/federated', body, async (ctx) => {
    // callback from repost
    if (ctx.request.body?.upstream === FederatedProvider.GOOGLE) {
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

      const account = await Account.findByFederated(
        FederatedProvider.GOOGLE,
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

    if (ctx.request.body?.upstream === FederatedProvider.APPLE) {
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

      const account = await Account.findByFederated(
        FederatedProvider.APPLE,
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

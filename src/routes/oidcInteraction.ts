import { randomBytes } from 'crypto';
import { Context } from 'koa';
import render from '@koa/ejs';
import { koaBody as bodyParser } from 'koa-body';
import Router from 'koa-router';
import { getGoogleClient } from '../lib/google';
import path from 'path';
import { Client } from 'openid-client';
import { Account, UserStore } from '../models/account';
import Provider from 'oidc-provider';
import { constants } from 'http2';

export const oidcInteraction = (provider: Provider) => {
  // Federated Clients
  let _googleClient: Client;
  const googleClient = async () => {
    if (!_googleClient) {
      const callbackUrl = `http://localhost:3000/interaction/callback/google`;
      _googleClient = await getGoogleClient('googleClientId', callbackUrl);
    }
    return _googleClient;
  };

  // Parse bodies
  const body = bodyParser({
    text: false,
    json: false,
    patchNode: true,
    patchKoa: true,
  });

  // Render views
  render(provider.app, {
    cache: false,
    viewExt: 'ejs',
    root: path.join(__dirname, 'views'),
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
    console.info(ctx.req);
    const { uid, prompt } = await provider.interactionDetails(ctx.req, ctx.res);
    if (prompt.name === 'login') {
      // Caller will indicate which to login with, for now default to Google
      return ctx.redirect(`/interaction/${uid}/federated/google`);
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

    const nextPath = `/interaction/${ctx.params.uid}/federated`;
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

  router.get('/interaction/callback/google', (ctx: Context) => {
    // Callback page, will POST results to /interaction/:uid/federated
    const nonce = randomBytes(16).toString('base64');
    return ctx.render('repost', { layout: false, upstream: 'google', nonce });
  });

  router.post('/interaction/:uid/federated', body, async (ctx) => {
    // callback from repost
    if (ctx.request.body.upstream === 'google') {
      const callbackParams = (await googleClient()).callbackParams(ctx.req);
      const nonce = ctx.cookies.get('google.nonce');
      const thisPath = `/interaction/${ctx.params.uid}/federated`;
      ctx.cookies.set('google.nonce', null, { path: thisPath });

      // TODO verify using Google's library?
      const tokenset = await (
        await googleClient()
      ).callback(undefined, callbackParams, {
        nonce,
        state: ctx.params.uid,
        response_type: 'id_token',
      });

      const account = await Account.findByFederated(
        UserStore.GOOGLE,
        tokenset.claims()
      );

      const result = {
        login: {
          accountId: account.accountId,
        },
      };
      return provider.interactionFinished(ctx.req, ctx.res, result, {
        mergeWithLastSubmission: false,
      });
    }
    return undefined;
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
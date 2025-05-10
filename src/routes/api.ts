import { koaBody as bodyParser } from 'koa-body';
import Router from 'koa-router';
import { constants } from 'http2';
import { Account } from '../models/account';
import { IdentityProvider } from '../types/IdentityProvider';
import { FederatedClients } from '../lib/federatedClients';

export const api = (
  verifyToken: (
    token: string | undefined,
    accountId: string
  ) => Promise<boolean>,
  federatedClients: FederatedClients
) => {
  // Parse json bodies
  const body = bodyParser({
    text: false,
    json: true,
    urlencoded: false,
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

  const authMiddleware = async (ctx, next) => {
    const extractTokenFromHeader = (
      authorization: string | undefined
    ): string | undefined => {
      const [type, token] = authorization?.split(' ') ?? [];
      return type === 'Bearer' ? token : undefined;
    };

    const accountId = ctx.params.accountId;
    const authorization = ctx.request.header.authorization;
    const token = extractTokenFromHeader(authorization);
    if (await verifyToken(token, accountId)) {
      return next();
    }

    ctx.status = 401;
    return;
  };

  router.post(
    '/api/account/:accountId/delete',
    authMiddleware,
    body,
    async (ctx) => {
      const accountId = ctx.params.accountId;
      const account = new Account(accountId);

      const appleTokens = await account.federatedTokens(IdentityProvider.APPLE);
      if (appleTokens?.refresh_token) {
        try {
          // Revoke apple connection
          console.info('revoking apple connection');
          (await federatedClients.appleClient()).revoke(
            appleTokens.refresh_token,
            'refresh_token'
          );
        } catch (e) {
          console.error(e);
        }
      }

      // Delete account from db
      await account.destroy();

      ctx.status = 204;
    }
  );

  return router;
};

import { koaBody as bodyParser } from 'koa-body';
import Router from 'koa-router';
import { constants } from 'http2';

export const api = (
  verifyToken: (
    token: string | undefined,
    accountId: string
  ) => Promise<boolean>
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
      console.info(accountId);
      ctx.status = 204;
    }
  );

  return router;
};

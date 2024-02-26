import { Handler } from 'aws-lambda';
import { JWK } from 'oidc-provider';
import serverless from 'serverless-http';
import { OidcOptions, initProvider } from '../lib/oidc';
import { getSecret } from '../utils/secrets';
import mount from 'koa-mount';
import Koa from 'koa';

const oidcOptions = async (): Promise<OidcOptions> => {
  const secret = await getSecret('sigRSA');
  const keys: JWK[] = [JSON.parse(secret)];
  return { keys, issuer: 'http://localhost:3000' };
};

let serverlessHandler: serverless.Handler;
const initServerlessHandler = async (): Promise<serverless.Handler> => {
  if (!serverlessHandler) {
    const koaApp = new Koa();
    koaApp.proxy = true;

    koaApp.use(async (ctx, next) => {
      if (
        ['/.well-known/openid-configuration', '/jwks'].includes(ctx.request.url)
      ) {
        ctx.request.url = `/oidc${ctx.request.url}`;
      }

      // TODO request.secure is true and protocol is https because of serverless
      // This breaks oidc provider redirects

      await next();
    });

    const provider = initProvider(await oidcOptions());
    koaApp.use(mount('/oidc', provider.app));

    serverlessHandler = serverless(koaApp);
  }
  return serverlessHandler;
};

export const handler: Handler = async (event, context) => {
  const serverlessHandler = await initServerlessHandler();
  return serverlessHandler(event, context);
};

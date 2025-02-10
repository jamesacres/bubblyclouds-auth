import { Handler } from 'aws-lambda';
import { JWK } from 'oidc-provider';
import serverless from 'serverless-http';
import { initProvider } from '../lib/oidc';
import { OidcOptions } from '../types/OidcOptions';
import { getSecret } from '../utils/secrets';
import mount from 'koa-mount';
import Koa from 'koa';
import { AppConfig } from '../types/AppConfig';
import { Ses } from '../lib/ses';
import { SignInCode } from '../lib/signInCode';

const oidcOptions = async (): Promise<OidcOptions> => {
  const appConfig: AppConfig = await fetch(
    `http://localhost:2772${process.env.AWS_APPCONFIG_EXTENSION_PREFETCH_LIST}`
  ).then(async (res) => {
    const response = await res.json();
    if (!res.ok) {
      throw Error(response);
    }
    return response;
  });
  const secret = await getSecret('sigRSA');
  const keys: JWK[] = [JSON.parse(secret)];
  const ses = new Ses(appConfig.aws.ses);
  const signInCode = new SignInCode();
  return { appConfig, keys, ses, signInCode, issuer: appConfig.serverUrl };
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

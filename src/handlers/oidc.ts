import { Handler } from 'aws-lambda';
import { JWK } from 'oidc-provider';
import serverless from 'serverless-http';
import { OidcOptions, initProvider } from '../lib/oidc';
import { getSecret } from '../utils/secrets';

const oidcOptions = async (): Promise<OidcOptions> => {
  const secret = await getSecret('sigRSA');
  const keys: JWK[] = [JSON.parse(secret)];
  return { keys };
};

let serverlessHandler;
const initServerlessHandler = async (): Promise<serverless.Handler> => {
  if (!serverlessHandler) {
    const provider = initProvider(await oidcOptions());
    const koaApp = provider.app;
    serverlessHandler = serverless(koaApp, { basePath: '/oidc' });
  }
  return serverlessHandler;
};

export const handler: Handler = async (event, context) => {
  const serverlessHandler = await initServerlessHandler();
  const result = await serverlessHandler(event, context);
  return result;
};

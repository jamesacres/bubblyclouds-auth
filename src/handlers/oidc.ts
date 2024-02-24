import { Handler } from 'aws-lambda';
import serverless from 'serverless-http';
import { initProvider } from '../lib/oidc';

const provider = initProvider();
const koaApp = provider.app;
const serverlessHandler = serverless(koaApp, { basePath: '/oidc' });

export const handler: Handler = async (event, context) => {
  const result = await serverlessHandler(event, context);
  return result;
};

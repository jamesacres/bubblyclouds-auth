import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import serverless from 'serverless-http';
import { initProvider } from '../lib/oidc';

const provider = initProvider();
const koaApp = provider.app;
const serverlessHandler = serverless(koaApp, { basePath: '/oidc' });

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const result = (await serverlessHandler(
    event,
    context
  )) as APIGatewayProxyResult;
  return result;
};

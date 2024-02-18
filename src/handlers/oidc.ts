import { APIGatewayProxyHandler } from 'aws-lambda';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const payload = JSON.parse(event.body ?? '{}');
  console.info(payload);
  const response = {};
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/json' },
    body: JSON.stringify(response),
  };
};

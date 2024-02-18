import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './oidc';

describe('Oidc Handler', () => {
  it('should return 200 OK', async () => {
    const result = await handler(
      {
        body: JSON.stringify({}),
        headers: {},
        httpMethod: 'GET',
      } as APIGatewayProxyEvent,
      {} as Context,
      () => {}
    );
    expect(result).toStrictEqual({
      body: '{}',
      headers: {
        'Content-Type': 'text/json',
      },
      statusCode: 200,
    });
  });
});

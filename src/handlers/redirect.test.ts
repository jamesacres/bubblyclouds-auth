import { Context } from 'aws-lambda';
import { handler } from './redirect';

describe('Redirect Handler', () => {
  it('should return 301 redirect', async () => {
    const result = await handler(
      {
        body: JSON.stringify({}),
        headers: {},
        httpMethod: 'GET',
      },
      {} as Context,
      () => {}
    );
    expect(result).toStrictEqual({
      headers: {
        Location: 'https://bubblyclouds.com',
      },
      statusCode: 301,
    });
  });
});

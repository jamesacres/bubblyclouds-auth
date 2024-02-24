import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './oidc';

describe('Oidc Handler', () => {
  it('should return 200 OK', async () => {
    const result = await handler(
      {
        body: JSON.stringify({}),
        headers: {},
        httpMethod: 'GET',
        path: '/oidc/jwks',
      } as APIGatewayProxyEvent,
      {} as Context,
      () => {}
    );
    expect(result).toStrictEqual({
      body: JSON.stringify({
        keys: [
          {
            kty: 'RSA',
            use: 'sig',
            kid: 'keystore-CHANGE-ME',
            alg: 'RS256',
            e: 'AQAB',
            n: 'xwQ72P9z9OYshiQ-ntDYaPnnfwG6u9JAdLMZ5o0dmjlcyrvwQRdoFIKPnO65Q8mh6F_LDSxjxa2Yzo_wdjhbPZLjfUJXgCzm54cClXzT5twzo7lzoAfaJlkTsoZc2HFWqmcri0BuzmTFLZx2Q7wYBm0pXHmQKF0V-C1O6NWfd4mfBhbM-I1tHYSpAMgarSm22WDMDx-WWI7TEzy2QhaBVaENW9BKaKkJklocAZCxk18WhR0fckIGiWiSM5FcU1PY2jfGsTmX505Ub7P5Dz75Ygqrutd5tFrcqyPAtPTFDk8X1InxkkUwpP3nFU5o50DGhwQolGYKPGtQ-ZtmbOfcWQ',
          },
        ],
      }),
      headers: {
        'access-control-allow-origin': '*',
        'content-length': '437',
        'content-type': 'application/jwk-set+json; charset=utf-8',
        vary: 'Origin',
      },
      isBase64Encoded: false,
      statusCode: 200,
    });
  });
});

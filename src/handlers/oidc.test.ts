import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

const mockAppConfig = {
  aws: { ses: { region: 'us-east-1', fromAddress: 'noreply@example.com' } },
  serverUrl: 'https://auth.bubblyclouds.com',
  clients: [
    {
      client_id: 'test-client',
      client_secret: 'test-secret',
      redirect_uris: ['https://example.com/callback'],
      'urn:custom:client:allowed-cors-origins': ['https://example.com'],
    },
  ],
  cookies: { secretKeys: ['test-secret-key'] },
  federatedClients: {
    google: { clientId: 'google-client-id' },
    apple: {
      clientId: 'apple-client-id',
      privateKey: 'apple-private-key',
      teamId: 'apple-team-id',
      keyId: 'apple-key-id',
    },
  },
  resources: {},
  demoAccounts: {},
};

const mockJwk = {
  kty: 'RSA',
  use: 'sig',
  kid: 'keystore-CHANGE-ME',
  alg: 'RS256',
  e: 'AQAB',
  n: 'xwQ72P9z9OYshiQ-ntDYaPnnfwG6u9JAdLMZ5o0dmjlcyrvwQRdoFIKPnO65Q8mh6F_LDSxjxa2Yzo_wdjhbPZLjfUJXgCzm54cClXzT5twzo7lzoAfaJlkTsoZc2HFWqmcri0BuzmTFLZx2Q7wYBm0pXHmQKF0V-C1O6NWfd4mfBhbM-I1tHYSpAMgarSm22WDMDx-WWI7TEzy2QhaBVaENW9BKaKkJklocAZCxk18WhR0fckIGiWiSM5FcU1PY2jfGsTmX505Ub7P5Dz75Ygqrutd5tFrcqyPAtPTFDk8X1InxkkUwpP3nFU5o50DGhwQolGYKPGtQ-ZtmbOfcWQ',
  d: 'C0G3QGI6OQ6tvbCNYGCqq043YI_8MiBl7C5dqbGZmx1ewdJBhMNJPStuckhskiTVjnmeSfzBjT9T8vThKlH3CizaKCqgDh_jBJF8JcGa2FwkAQ4J7dv7CPBMW4Q1IVp3NHqEwfhRjJi-bT-2KflFKGWMKl7Y0YE8G-T5bBNq3MoB8sHN4fTj2mBBp3JN_kYNQTEn3t7SFV3Z00nOZ6-f7XnY6N1cJPJdOzxmKM5mTJaYQ5HrV4K-FJBhMHO7mcKwXf4DP0U8c3DYVD1NdHiJpzPkT7v5wU4w9GhY_jH5H0bBqPqiVKjkEDHj5A_L5oGiN5s3MwHv8PzB3hw',
  p: '8a8rNr0-W_nqm-1v6p5IVPB_8c-QJk5V5zMC_rAhRvKKL7PdDJ0aXx4qV6qQDphKnOt-IQJgxIZbLHCLDvAzQ',
  q: 'zEY5-p0PkWs1vM4-sCfJYGd14cXPW_BKzj7M7EB_jRq-5bvXJdJBKbKuqKnl12eTHuD-HPWJ0z-pxAhJVfGAQ',
  dp: 'AzJLOXZSsBGqJB3k7Rq9HqV5IqE-Kt4NNRJ0w2-3vX2BKnL6YKB9V9I5b-0VkJaJ4n1Rn-Gm-XdT3S5EIAAAQ',
  dq: 'AzJLOXZSsBGqJB3k7Rq9HqV5IqE-Kt4NNRJ0w2-3vX2BKnL6YKB9V9I5b-0VkJaJ4n1Rn-Gm-XdT3S5EIAAAQ',
  qi: 'AzJLOXZSsBGqJB3k7Rq9HqV5IqE-Kt4NNRJ0w2-3vX2BKnL6YKB9V9I5b-0VkJaJ4n1Rn-Gm-XdT3S5EIAAAQ',
};

beforeAll(() => {
  process.env.AWS_APPCONFIG_EXTENSION_PREFETCH_LIST =
    '/applications/test/environments/test/configurations/test';
  process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = '2773';
  process.env.AWS_SESSION_TOKEN = 'test-token';
  process.env.OAUTH_TABLE = 'test-table';
  process.env.AWS_REGION = 'us-east-1';

  global.fetch = jest.fn(async (url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('2772')) {
      return {
        ok: true,
        json: async () => mockAppConfig,
      } as Response;
    }
    if (urlStr.includes('secretsmanager')) {
      return {
        ok: true,
        json: async () => ({ SecretString: JSON.stringify(mockJwk) }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
});

describe('Oidc Handler', () => {
  it('should return 200 OK for JWKS endpoint', async () => {
    const { handler } = await import('./oidc');
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
    expect(result).toMatchObject({
      statusCode: 200,
      isBase64Encoded: false,
    });
    const body = JSON.parse((result as { body: string }).body);
    expect(body).toHaveProperty('keys');
    expect(Array.isArray(body.keys)).toBe(true);
  });

  it('should return 200 for openid-configuration endpoint', async () => {
    const { handler } = await import('./oidc');
    const result = await handler(
      {
        body: JSON.stringify({}),
        headers: { host: 'auth.bubblyclouds.com' },
        httpMethod: 'GET',
        path: '/.well-known/openid-configuration',
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
      () => {}
    );
    expect(result).toMatchObject({ statusCode: 200 });
  });
});

import { describe, it, expect, beforeAll } from '@jest/globals';
import { JWK } from 'oidc-provider';
import { initProvider } from './oidc';
import { DynamoDBAdapter } from '../adapters/dynamodb';
import { Ses } from './ses';
import { SignInCode } from './signInCode';
import { AppConfig } from '../types/AppConfig';

const TEST_RSA_JWK: JWK = {
  kty: 'RSA',
  use: 'sig',
  kid: 'test-key',
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

const TEST_APP_CONFIG: AppConfig = {
  serverUrl: 'https://auth.example.com',
  aws: {
    ses: {
      fromName: 'Test',
      fromEmail: 'noreply@example.com',
      fromArn: 'arn:aws:ses:us-east-1:123:identity/example.com',
    },
  },
  cookies: { secretKeys: ['test-secret-key-long-enough-for-cookie-signing'] },
  clients: [
    {
      client_id: 'web-client',
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: ['https://app.example.com/cb'],
      'urn:custom:client:allowed-cors-origins': ['https://app.example.com'],
    },
  ],
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

beforeAll(() => {
  DynamoDBAdapter.configure({ tableName: 'test-table', region: 'us-east-1' });
});

const makeOptions = () => ({
  appConfig: TEST_APP_CONFIG,
  issuer: 'https://auth.example.com',
  keys: [TEST_RSA_JWK],
  ses: new Ses(TEST_APP_CONFIG.aws.ses),
  signInCode: new SignInCode({}),
});

describe('initProvider', () => {
  it('returns a Provider instance with callback', () => {
    const { provider } = initProvider(makeOptions());
    expect(provider).toBeDefined();
    expect(typeof provider.callback).toBe('function');
  });

  it('does not throw when constructed with valid options', () => {
    expect(() => initProvider(makeOptions())).not.toThrow();
  });
});

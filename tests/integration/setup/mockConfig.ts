import { AppConfig } from '../../../src/types/AppConfig.js';

// Fixed test RSA key - private key for signing, used in integration tests only
// Generated with: node -e "const {generateKeyPairSync}=require('crypto'); const k=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'jwk'},privateKeyEncoding:{type:'pkcs8',format:'jwk'}}); console.log(JSON.stringify(k.privateKey))"
export const TEST_RSA_JWK = {
  kty: 'RSA',
  use: 'sig',
  kid: 'integration-test-key',
  alg: 'RS256',
  // Public key components
  e: 'AQAB',
  n: 'xwQ72P9z9OYshiQ-ntDYaPnnfwG6u9JAdLMZ5o0dmjlcyrvwQRdoFIKPnO65Q8mh6F_LDSxjxa2Yzo_wdjhbPZLjfUJXgCzm54cClXzT5twzo7lzoAfaJlkTsoZc2HFWqmcri0BuzmTFLZx2Q7wYBm0pXHmQKF0V-C1O6NWfd4mfBhbM-I1tHYSpAMgarSm22WDMDx-WWI7TEzy2QhaBVaENW9BKaKkJklocAZCxk18WhR0fckIGiWiSM5FcU1PY2jfGsTmX505Ub7P5Dz75Ygqrutd5tFrcqyPAtPTFDk8X1InxkkUwpP3nFU5o50DGhwQolGYKPGtQ-ZtmbOfcWQ',
  // Private key component (test key only - never use in production)
  d: 'FXgMdpN8SU8-fS1JLqx5YF2JjmDuXlLFBFBJNmLqChqZXmBKXtHoFJBk1Kd5LnH3LqOe8VqrS_jHm_RBkn4EMm0aOHEJFW-U2_6Tj9mEhVS5fR3kFkVasSZ4Ee7Y43qZM6dPdXKtR2QZ2gKVB1IhBMoHIJuLiOnNlqAdJG9rRDwpNOvJkU7fIH1zflAKxNuFCuPLXJG4Sp6VpHPiDCpzZeFLrMLqFtN9R6PKv6Q-CKLS3jl0RUyvEBsXpxKn0rlCLOKJ9Oj_nH-XNTDW0JnQxzGz0WCqoqtHBcH_YwN5LY4dBaGh5XhvNQpzq8g3_HirEqGRVqlYo_-V-Q',
  p: '6oITnj-TdKJaqO_LDvHhF8DfHm3u7Aw3bQoH0QKwx5mJxlX6-ZHxvr_y3hIAQC0vXOxWvW7u7FNjEAQ9P0Q',
  q: '2xVS_mMhVTWWBtMBdYCJf_6kEGh-VO3K5u-L-wNfL-F5y5kzPkSM5kJMB8kVLGn1uK7yH3LSvkWpP9yWL9Q',
  dp: 'cq15JF3yFHCsatQHInqBMeEKWkJQ4kNPuJrTi7F3HJT0QiQAIoQG5cERb2PiURNwXiJmQyc-U0P6s3kM_Q',
  dq: 'RXKu7-LpPIV2NLv2Ef3nN4X4H5b5R6W4RXBhvhL2F1e-h-y_4rPwnrjovTPsExKcqCVXEb4AaP6eOJBW1Q',
  qi: 'T9xSJG0O2G9koPNvyb5xSEwU2zv0wSW2f01YIVLZd3VEfBkbRfzHFZ5Rb7dOJqMCGy9yVP8v1aMOF15XVQ',
};

// Test server URL (no trailing slash)
export const TEST_SERVER_URL = 'http://localhost:9876';

// Test DynamoDB table name
export const TEST_TABLE_NAME = 'auth-integration-test';

// Test email for email sign-in flow
export const TEST_EMAIL = 'integration-test@example.com';

// Fixed sign-in code for the demo account
export const TEST_SIGN_IN_CODE = 'ABC-DEF-GHI';

// Test client IDs
export const TEST_WEB_CLIENT_ID = 'bubbly-sudoku';
export const TEST_NATIVE_CLIENT_ID = 'bubbly-sudoku-native';

// Test resource
export const TEST_RESOURCE = 'https://api.bubblyclouds.com';

export const TEST_APP_CONFIG: AppConfig = {
  serverUrl: TEST_SERVER_URL,
  serverUrlProd: TEST_SERVER_URL,
  aws: {
    ses: {
      fromName: 'Bubbly Clouds Test',
      fromEmail: 'noreply@test.example.com',
      fromArn: 'arn:aws:ses:us-east-1:123456789:identity/test.example.com',
      aws: {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'local',
          secretAccessKey: 'local',
        },
      },
    },
  },
  cookies: {
    secretKeys: [
      'integration-test-cookie-secret-key-1-long-enough',
      'integration-test-cookie-secret-key-2-long-enough',
    ],
  },
  clients: [
    {
      client_id: TEST_WEB_CLIENT_ID,
      client_secret: undefined,
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: ['http://localhost:3000/cb'],
      'urn:custom:client:allowed-cors-origins': ['http://localhost:3000'],
    },
    {
      client_id: TEST_NATIVE_CLIENT_ID,
      client_secret: undefined,
      token_endpoint_auth_method: 'none',
      application_type: 'native',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: ['com.bubblyclouds.sudoku://-/auth'],
    },
  ],
  federatedClients: {
    google: {
      clientId: 'test-google-client-id.apps.googleusercontent.com',
    },
    apple: {
      clientId: 'com.bubblyclouds.test',
      privateKey: `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIOabt9bX1QbXRHmVK8EiN7bS4LljQ4KsTt9hWCAaJJUXoAoGCCqGSM49
AwEHoWQDYgAEzLN1/wKXZOHLJpuFzNqoJyAWRmZPjcq7k7G+MIi2RXGvOGtEdlAl
CdAMwYXR2z/Rg3xnTtBwb7gJ5i7p4H0=
-----END EC PRIVATE KEY-----`,
      teamId: 'TEST1234567',
      keyId: 'TESTKEYID1',
    },
  },
  resources: {
    [TEST_RESOURCE]: {
      allowedClientIds: [TEST_WEB_CLIENT_ID, TEST_NATIVE_CLIENT_ID],
      clientIdScope: {
        [TEST_WEB_CLIENT_ID]:
          'openid offline_access parties.write members.write invites.write sessions.write',
        [TEST_NATIVE_CLIENT_ID]:
          'openid offline_access parties.write members.write invites.write sessions.write',
      },
      config: {
        scope:
          'openid offline_access parties.write members.write invites.write sessions.write',
        accessTokenFormat: 'jwt',
        accessTokenTTL: 60 * 60 * 2,
      },
    },
  },
  demoAccounts: {
    [TEST_EMAIL]: {
      signInCode: TEST_SIGN_IN_CODE,
    },
  },
};

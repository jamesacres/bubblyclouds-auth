import http from 'http';
import Koa from 'koa';
import mount from 'koa-mount';
import { JWK } from 'oidc-provider';
import { generateKeyPair, exportJWK } from 'jose';
import { initProvider } from '../../../src/lib/oidc.js';
import { DynamoDBAdapter } from '../../../src/adapters/dynamodb.js';
import { Ses } from '../../../src/lib/ses.js';
import { SignInCode } from '../../../src/lib/signInCode.js';
import {
  TEST_APP_CONFIG,
  TEST_RSA_JWK,
  TEST_TABLE_NAME,
} from './mockConfig.js';

DynamoDBAdapter.configure({
  tableName: TEST_TABLE_NAME,
  region: 'us-east-1',
  endpoint: 'http://localhost:8000',
});

export interface TestServer {
  server: http.Server;
  baseUrl: string;
  port: number;
  close: () => Promise<void>;
}

// Generate a fresh RSA key pair for the integration tests at runtime.
// This avoids hardcoding a real private key while still allowing token
// verification flows to work end-to-end.
export const generateTestJwk = async (): Promise<JWK> => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  return {
    ...jwk,
    use: 'sig',
    kid: 'integration-test-key',
    alg: 'RS256',
  } as JWK;
};

// Fall back to the hardcoded test JWK if key generation is not needed.
// Using generateTestJwk() is preferred for full flows.
export const getTestJwk = (): JWK => TEST_RSA_JWK as unknown as JWK;

export const startTestServer = async (jwk?: JWK): Promise<TestServer> => {
  const keys: JWK[] = [jwk || (await generateTestJwk())];

  const ses = new Ses(TEST_APP_CONFIG.aws.ses);
  const signInCode = new SignInCode(TEST_APP_CONFIG.demoAccounts);

  const { provider, cookieKeys } = initProvider({
    appConfig: TEST_APP_CONFIG,
    keys,
    ses,
    signInCode,
    issuer: TEST_APP_CONFIG.serverUrl,
  });

  const koaApp = new Koa();
  koaApp.proxy = true;
  koaApp.keys = cookieKeys;

  // URL-rewriting middleware matching src/handlers/oidc.ts
  koaApp.use(async (ctx, next) => {
    if (
      ['/.well-known/openid-configuration', '/jwks', '/api'].some((prefix) =>
        ctx.request.url.startsWith(prefix)
      )
    ) {
      ctx.request.url = `/oidc${ctx.request.url}`;
    }
    await next();
  });

  koaApp.use(mount('/oidc', provider));

  const server = http.createServer(koaApp.callback());

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get server port');
  }
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    baseUrl,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
};

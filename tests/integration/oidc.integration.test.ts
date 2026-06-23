/**
 * Integration tests for the Bubbly Clouds OIDC auth service.
 *
 * Prerequisites:
 *   - Local DynamoDB running at http://localhost:8000
 *     e.g. `docker run -p 8000:8000 amazon/dynamodb-local`
 *
 * Run with:
 *   npm run test:integration
 *
 * The tests set the required environment variables before any source modules
 * are imported so that module-level AWS SDK clients pick up the right config.
 */

import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
} from '@jest/globals';

// ─── Environment variables must be set before any src imports ───────────────
process.env.OAUTH_TABLE = 'auth-integration-test';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'local';
process.env.AWS_SECRET_ACCESS_KEY = 'local';
process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';

import crypto from 'crypto';
import http from 'http';
import type { JWK } from 'oidc-provider';
import type { TestServer } from './setup/appServer';
const { setupDynamoDB, teardownDynamoDB, clearTable } =
  await import('./setup/dynamodb');
import { startTestServer, generateTestJwk } from './setup/appServer';
const {
  TEST_EMAIL,
  TEST_SIGN_IN_CODE,
  TEST_WEB_CLIENT_ID,
  TEST_NATIVE_CLIENT_ID,
  TEST_RESOURCE,
  TEST_SERVER_URL,
} = await import('./setup/mockConfig.js');

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

interface FetchResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
  json: <T = unknown>() => T;
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  followRedirects?: boolean;
  cookies?: string;
}

/**
 * Minimal HTTP client using Node's built-in `http` module.
 * Returns the response without following redirects by default so we can
 * assert on Location headers during OIDC flows.
 */
async function httpRequest(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResponse> {
  const {
    method = 'GET',
    headers = {},
    body,
    followRedirects = false,
    cookies,
  } = options;

  if (!url.startsWith('http://127.0.0.1')) {
    throw Error(`can't request url ${url}`);
  }
  console.info('url', url);
  const parsedUrl = new URL(url);

  const requestHeaders: Record<string, string> = {
    ...headers,
    ...(cookies ? { cookie: cookies } : {}),
    ...(body ? { 'content-length': Buffer.byteLength(body).toString() } : {}),
  };

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80,
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        headers: requestHeaders,
      },
      (res) => {
        const chunks: Uint8Array[] = [];
        res.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          const responseHeaders: Record<string, string | string[]> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (value !== undefined) {
              responseHeaders[key] = value;
            }
          }

          const response: FetchResponse = {
            status: res.statusCode || 0,
            headers: responseHeaders,
            body: responseBody,
            json: <T>() => JSON.parse(responseBody) as T,
          };

          if (
            followRedirects &&
            res.statusCode !== undefined &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            // Follow redirect
            const location = res.headers.location;
            const nextUrl = location.startsWith('http')
              ? location
              : `${parsedUrl.protocol}//${parsedUrl.host}${location}`;

            // Propagate cookies from redirect responses
            const setCookieHeader = res.headers['set-cookie'] || [];
            const newCookies = mergeCookies(cookies || '', setCookieHeader);

            httpRequest(nextUrl, { ...options, cookies: newCookies })
              .then(resolve)
              .catch(reject);
          } else {
            resolve(response);
          }
        });
        res.on('error', reject);
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * Extracts Set-Cookie headers and merges them into a cookie string.
 */
function mergeCookies(existing: string, setCookieHeaders: string[]): string {
  const cookieMap = new Map<string, string>();

  // Parse existing cookies
  if (existing) {
    for (const part of existing.split(';')) {
      const trimmed = part.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        cookieMap.set(
          trimmed.slice(0, eqIdx).trim(),
          trimmed.slice(eqIdx + 1).trim()
        );
      }
    }
  }

  // Add/overwrite from Set-Cookie
  for (const header of setCookieHeaders) {
    // Format: name=value; Path=/; HttpOnly; ...
    const firstPart = header.split(';')[0].trim();
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim();
      const value = firstPart.slice(eqIdx + 1).trim();
      cookieMap.set(name, value);
    }
  }

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Extracts cookies from a response's Set-Cookie headers.
 */
function extractCookies(response: FetchResponse, existing = ''): string {
  const setCookie = response.headers['set-cookie'];
  const setCookieArray = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return mergeCookies(existing, setCookieArray);
}

/**
 * Extracts the interaction UID from a redirect Location header.
 * Expects format: /oidc/interaction/<uid>
 */
function extractInteractionUid(location: string): string {
  const match = location.match(/\/interaction\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Could not extract interaction UID from: ${location}`);
  }
  return match[1];
}

// ─── Test state ───────────────────────────────────────────────────────────────

let testServer: TestServer;
let testJwk: JWK;

// ─── Test suite ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  // Set up the real local DynamoDB table
  await setupDynamoDB();

  // Generate a fresh RSA key pair for this test run
  testJwk = await generateTestJwk();

  // Start the Koa server backed by real local DynamoDB
  testServer = await startTestServer(testJwk);
}, 30000);

afterAll(async () => {
  if (testServer) {
    await testServer.close();
  }
  await teardownDynamoDB();
}, 30000);

beforeEach(async () => {
  // Clear DynamoDB data between tests for isolation
  await clearTable();
}, 10000);

// ─── 1. OIDC Discovery ───────────────────────────────────────────────────────

describe('OIDC Discovery', () => {
  it('GET /.well-known/openid-configuration returns 200 with OIDC metadata', async () => {
    const res = await httpRequest(
      `${testServer.baseUrl}/.well-known/openid-configuration`
    );

    expect(res.status).toBe(200);

    const body = res.json<{
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      jwks_uri: string;
      response_types_supported: string[];
    }>();

    expect(body.issuer).toBe(TEST_SERVER_URL);
    expect(body.authorization_endpoint).toContain('/oidc/auth');
    expect(body.token_endpoint).toContain('/oidc/token');
    expect(body.jwks_uri).toContain('/jwks');
    expect(body.response_types_supported).toContain('code');
  });

  it('GET /jwks returns 200 with JWK set', async () => {
    const res = await httpRequest(`${testServer.baseUrl}/jwks`);

    expect(res.status).toBe(200);

    const body = res.json<{
      keys: Array<{ kty: string; use: string; kid: string }>;
    }>();
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);
    expect(body.keys[0].kty).toBe('RSA');
    expect(body.keys[0].use).toBe('sig');
    expect(body.keys[0].kid).toBe('integration-test-key');
  });
});

// ─── 2. Authorization endpoint ───────────────────────────────────────────────

describe('Authorization endpoint', () => {
  it('GET /oidc/auth with basic scopes redirects to interaction', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_WEB_CLIENT_ID,
      redirect_uri: 'http://localhost:3000/cb',
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'test-state-basic',
    });

    const res = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${params.toString()}`
    );

    expect(res.status).toBe(303);
    expect(res.headers.location).toBeTruthy();
    expect(res.headers.location as string).toContain('/oidc/interaction/');
  });

  it('GET /oidc/auth with full scopes and resource redirects to interaction', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_WEB_CLIENT_ID,
      redirect_uri: 'http://localhost:3000/cb',
      scope:
        'openid profile offline_access parties.write members.write invites.write sessions.write',
      resource: TEST_RESOURCE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'test-state-full',
    });

    const res = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${params.toString()}`
    );

    expect(res.status).toBe(303);
    expect(res.headers.location as string).toContain('/oidc/interaction/');
  });

  it('GET /oidc/auth with bubblyIdentityProvider=google redirects to Google OAuth', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_WEB_CLIENT_ID,
      redirect_uri: 'http://localhost:3000/cb',
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      bubblyIdentityProvider: 'google',
      state: 'test-state-google',
    });

    // First: hit /oidc/auth → redirects to interaction
    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${params.toString()}`
    );
    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location as string;
    expect(interactionLocation).toContain('/oidc/interaction/');

    const uid = extractInteractionUid(interactionLocation);
    const cookies = extractCookies(authRes);

    // Second: follow to /oidc/interaction/:uid — because bubblyIdentityProvider=google
    // is in the params, the interaction handler will redirect to /federated/google
    const interactionRes = await httpRequest(
      `${testServer.baseUrl}${interactionLocation}`,
      { cookies }
    );
    expect(interactionRes.status).toBe(303);
    const federatedLocation = interactionRes.headers.location as string;
    expect(federatedLocation).toContain('/federated/google');

    const updatedCookies = extractCookies(interactionRes, cookies);

    // Third: hit the federated/google endpoint which should redirect to Google
    const googleRedirectRes = await httpRequest(
      `${testServer.baseUrl}${federatedLocation}`,
      { cookies: updatedCookies }
    );
    expect(googleRedirectRes.status).toBe(303);
    const googleLocation = googleRedirectRes.headers.location as string;
    // The mock returns a google URL
    expect(googleLocation).toContain('accounts.google.com');

    void uid; // used via cookies/flow
  });

  it('GET /oidc/auth with native client redirects to interaction', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_NATIVE_CLIENT_ID,
      redirect_uri: 'com.bubblyclouds.sudoku://-/auth',
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'test-state-native',
    });

    const res = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${params.toString()}`
    );

    expect(res.status).toBe(303);
    expect(res.headers.location as string).toContain('/oidc/interaction/');
  });

  it('GET /oidc/auth with bubblyEmail triggers email sign-in page', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_WEB_CLIENT_ID,
      redirect_uri: 'http://localhost:3000/cb',
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      bubblyEmail: TEST_EMAIL,
      state: 'test-state-email',
    });

    // Hit /oidc/auth → redirects to interaction
    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${params.toString()}`
    );
    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location as string;
    expect(interactionLocation).toContain('/oidc/interaction/');

    const cookies = extractCookies(authRes);

    // Follow to interaction — bubblyEmail is in the params so it should send email and show login page
    const interactionRes = await httpRequest(
      `${testServer.baseUrl}${interactionLocation}`,
      { cookies }
    );

    // Response should be 200 HTML login page (email was sent)
    expect(interactionRes.status).toBe(200);
    expect(interactionRes.headers['content-type'] as string).toContain('html');
  });
});

// ─── 3. Full email sign-in flow ───────────────────────────────────────────────

describe('Full email sign-in flow', () => {
  it('completes email sign-in and exchanges code for tokens', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Step 1: Start auth flow
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_WEB_CLIENT_ID,
      redirect_uri: 'http://localhost:3000/cb',
      scope: 'openid profile offline_access',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'test-state-email-flow',
    });

    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${authParams.toString()}`
    );
    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location as string;
    const uid = extractInteractionUid(interactionLocation);
    let cookies = extractCookies(authRes);

    // Step 2: POST email to interaction to trigger code sending
    const emailBody = new URLSearchParams({ email: TEST_EMAIL }).toString();
    const emailRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: emailBody,
        cookies,
      }
    );
    expect(emailRes.status).toBe(200);
    cookies = extractCookies(emailRes, cookies);

    // Step 3: POST email code to interaction
    // The TEST_EMAIL is a demo account with a fixed TEST_SIGN_IN_CODE
    const codeBody = new URLSearchParams({
      email: TEST_EMAIL,
      emailCode: TEST_SIGN_IN_CODE,
    }).toString();

    const codeRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: codeBody,
        cookies,
      }
    );

    // After correct code: oidc-provider redirects to the auth endpoint which
    // then redirects to the client redirect_uri with the authorization code
    expect([302, 303]).toContain(codeRes.status);
    cookies = extractCookies(codeRes, cookies);

    // Follow the redirect chain to get the authorization code
    let location = codeRes.headers.location as string;
    expect(location).toBeTruthy();

    // Follow redirects until we reach the client redirect_uri
    let currentCookies = cookies;
    let authCode: string | null = null;
    let maxRedirects = 10;

    while (location && maxRedirects-- > 0) {
      const redirectUrl = location.startsWith('http')
        ? location
        : `${testServer.baseUrl}${location}`;

      // Check if we've reached the client callback with a code
      const parsedLocation = new URL(redirectUrl, testServer.baseUrl);
      authCode = parsedLocation.searchParams.get('code');
      if (authCode) {
        break;
      }

      const redirectRes = await httpRequest(redirectUrl, {
        cookies: currentCookies,
      });
      currentCookies = extractCookies(redirectRes, currentCookies);

      if ([302, 303].includes(redirectRes.status)) {
        location = redirectRes.headers.location as string;
      } else {
        break;
      }
    }

    expect(authCode).toBeTruthy();

    // Step 4: Exchange authorization code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode!,
      redirect_uri: 'http://localhost:3000/cb',
      client_id: TEST_WEB_CLIENT_ID,
      code_verifier: codeVerifier,
    }).toString();

    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    expect(tokenRes.status).toBe(200);

    const tokenBody2 = tokenRes.json<{
      access_token: string;
      token_type: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
    }>();

    expect(tokenBody2.access_token).toBeTruthy();
    expect(tokenBody2.token_type.toLowerCase()).toBe('bearer');
    expect(tokenBody2.expires_in).toBeGreaterThan(0);
  }, 30000);

  it('returns refresh token for web client with offline_access scope', async () => {
    const { authCode, codeVerifier, finalCookies } = await performEmailSignIn({
      clientId: TEST_WEB_CLIENT_ID,
      redirectUri: 'http://localhost:3000/cb',
      scope: 'openid profile offline_access',
    });

    void finalCookies;

    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });

    expect(tokenRes.status).toBe(200);
    const tokenData = tokenRes.json<{
      access_token: string;
      refresh_token?: string;
      id_token?: string;
    }>();
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.refresh_token).toBeTruthy();
    expect(tokenData.id_token).toBeTruthy();
  }, 30000);
});

// ─── 4. Token endpoint ───────────────────────────────────────────────────────

describe('Token endpoint', () => {
  it('POST /oidc/token with grant_type=authorization_code returns tokens', async () => {
    const { authCode, codeVerifier } = await performEmailSignIn({
      clientId: TEST_WEB_CLIENT_ID,
      redirectUri: 'http://localhost:3000/cb',
      scope: 'openid profile',
    });

    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });

    expect(tokenRes.status).toBe(200);
    const tokenData = tokenRes.json<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>();
    expect(tokenData.access_token).toBeTruthy();
    expect(tokenData.token_type.toLowerCase()).toBe('bearer');
    expect(tokenData.expires_in).toBeGreaterThan(0);
  }, 30000);

  it('POST /oidc/token with grant_type=refresh_token returns new tokens', async () => {
    const { authCode, codeVerifier } = await performEmailSignIn({
      clientId: TEST_WEB_CLIENT_ID,
      redirectUri: 'http://localhost:3000/cb',
      scope: 'openid offline_access',
    });

    // First exchange for tokens
    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const firstTokenData = tokenRes.json<{
      access_token: string;
      refresh_token: string;
    }>();
    expect(firstTokenData.refresh_token).toBeTruthy();

    // Now use the refresh token
    const refreshRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: firstTokenData.refresh_token,
        client_id: TEST_WEB_CLIENT_ID,
      }).toString(),
    });

    expect(refreshRes.status).toBe(200);
    const refreshData = refreshRes.json<{
      access_token: string;
      refresh_token?: string;
    }>();
    expect(refreshData.access_token).toBeTruthy();
  }, 30000);

  it('POST /oidc/token with full scopes and resource returns JWT access token', async () => {
    const { authCode, codeVerifier } = await performEmailSignIn({
      clientId: TEST_WEB_CLIENT_ID,
      redirectUri: 'http://localhost:3000/cb',
      scope:
        'openid profile offline_access parties.write members.write invites.write sessions.write',
      resource: TEST_RESOURCE,
    });

    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });

    expect(tokenRes.status).toBe(200);
    const tokenData = tokenRes.json<{
      access_token: string;
      token_type: string;
    }>();
    expect(tokenData.access_token).toBeTruthy();
    // JWT access tokens have 3 dot-separated parts
    expect(tokenData.access_token.split('.').length).toBe(3);
  }, 30000);
});

// ─── 5. Account delete API ────────────────────────────────────────────────────

describe('Account management API', () => {
  it('POST /api/account/:accountId/delete returns 204 with valid token', async () => {
    const { authCode, codeVerifier } = await performEmailSignIn({
      clientId: TEST_WEB_CLIENT_ID,
      redirectUri: 'http://localhost:3000/cb',
      scope: 'openid profile',
    });

    // Exchange code for tokens
    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });
    expect(tokenRes.status).toBe(200);
    const tokenData = tokenRes.json<{
      access_token: string;
      id_token: string;
    }>();

    // Decode the subject from the access token to get the accountId
    const jwtPayload = JSON.parse(
      Buffer.from(tokenData.access_token.split('.')[1], 'base64url').toString(
        'utf-8'
      )
    ) as { sub: string };
    const accountId = jwtPayload.sub;
    expect(accountId).toBeTruthy();

    // Delete the account
    const deleteRes = await httpRequest(
      `${testServer.baseUrl}/api/account/${accountId}/delete`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${tokenData.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    expect(deleteRes.status).toBe(204);
  }, 30000);

  it('POST /api/account/:accountId/delete returns 401 without valid token', async () => {
    const deleteRes = await httpRequest(
      `${testServer.baseUrl}/api/account/fake-account-id/delete`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer invalid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    expect(deleteRes.status).toBe(401);
  }, 10000);

  it('POST /api/account/:accountId/delete returns 401 without authorization header', async () => {
    const deleteRes = await httpRequest(
      `${testServer.baseUrl}/api/account/fake-account-id/delete`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }
    );

    expect(deleteRes.status).toBe(401);
  }, 10000);
});

// ─── 6. Token rotation after account re-login ─────────────────────────────────

describe('Token rotation', () => {
  it('refresh token still works after account re-login', async () => {
    // First login
    const { authCode: authCode1, codeVerifier: codeVerifier1 } =
      await performEmailSignIn({
        clientId: TEST_WEB_CLIENT_ID,
        redirectUri: 'http://localhost:3000/cb',
        scope: 'openid offline_access',
      });

    const tokenRes1 = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode1,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier1,
      }).toString(),
    });
    expect(tokenRes1.status).toBe(200);
    const firstTokens = tokenRes1.json<{
      refresh_token: string;
      access_token: string;
    }>();
    expect(firstTokens.refresh_token).toBeTruthy();

    // Second login (same account, new session)
    const { authCode: authCode2, codeVerifier: codeVerifier2 } =
      await performEmailSignIn({
        clientId: TEST_WEB_CLIENT_ID,
        redirectUri: 'http://localhost:3000/cb',
        scope: 'openid offline_access',
      });

    const tokenRes2 = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode2,
        redirect_uri: 'http://localhost:3000/cb',
        client_id: TEST_WEB_CLIENT_ID,
        code_verifier: codeVerifier2,
      }).toString(),
    });
    expect(tokenRes2.status).toBe(200);
    const secondTokens = tokenRes2.json<{
      refresh_token: string;
      access_token: string;
    }>();
    expect(secondTokens.refresh_token).toBeTruthy();

    // The first refresh token should still work (it's a different grant)
    const refreshRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: firstTokens.refresh_token,
        client_id: TEST_WEB_CLIENT_ID,
      }).toString(),
    });

    expect(refreshRes.status).toBe(200);
    const refreshData = refreshRes.json<{ access_token: string }>();
    expect(refreshData.access_token).toBeTruthy();
  }, 60000);
});

// ─── 7. Native client flow ────────────────────────────────────────────────────

describe('Native client flow', () => {
  it('native client completes email sign-in with consent step', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Step 1: Start auth flow for native client
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: TEST_NATIVE_CLIENT_ID,
      redirect_uri: 'com.bubblyclouds.sudoku://-/auth',
      scope: 'openid profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: 'test-state-native-flow',
    });

    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${authParams.toString()}`
    );
    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location as string;
    const uid = extractInteractionUid(interactionLocation);
    let cookies = extractCookies(authRes);

    // Step 2: POST email to get code
    const emailBody = new URLSearchParams({ email: TEST_EMAIL }).toString();
    const emailRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: emailBody,
        cookies,
      }
    );
    expect(emailRes.status).toBe(200);
    cookies = extractCookies(emailRes, cookies);

    // Step 3: POST email code
    const codeBody = new URLSearchParams({
      email: TEST_EMAIL,
      emailCode: TEST_SIGN_IN_CODE,
    }).toString();

    const codeRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: codeBody,
        cookies,
      }
    );
    expect([302, 303]).toContain(codeRes.status);
    cookies = extractCookies(codeRes, cookies);

    // For native clients there may be a consent step
    let location = codeRes.headers.location as string;
    let authCode: string | null = null;
    let maxRedirects = 10;

    while (location && maxRedirects-- > 0) {
      const redirectUrl =
        location.startsWith('http') || location.startsWith('com.')
          ? location
          : `${testServer.baseUrl}${location}`;

      console.info('TESTING', { redirectUrl, baseUrl: testServer.baseUrl });
      const parsedLocation = new URL(redirectUrl, testServer.baseUrl);
      authCode = parsedLocation.searchParams.get('code');
      if (authCode) {
        break;
      }

      // Check for consent page
      if (
        redirectUrl.includes('/interaction/') &&
        !redirectUrl.includes('/federated')
      ) {
        const consentRes = await httpRequest(redirectUrl, { cookies });
        cookies = extractCookies(consentRes, cookies);

        if ([302, 303].includes(consentRes.status)) {
          location = consentRes.headers.location as string;
        } else if (
          consentRes.status === 200 &&
          consentRes.body.includes('Press continue to return to the app.')
        ) {
          // POST to confirm consent
          const confirmRes = await httpRequest(
            `${testServer.baseUrl}/oidc/interaction/${uid}/confirm`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: '',
              cookies,
            }
          );
          cookies = extractCookies(confirmRes, cookies);
          location = confirmRes.headers.location as string;
        } else {
          break;
        }
      } else {
        const redirectRes = await httpRequest(redirectUrl, { cookies });
        cookies = extractCookies(redirectRes, cookies);

        if ([302, 303].includes(redirectRes.status)) {
          location = redirectRes.headers.location as string;
        } else {
          break;
        }
      }
    }

    expect(authCode).toBeTruthy();

    // Exchange code for tokens
    const tokenRes = await httpRequest(`${testServer.baseUrl}/oidc/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode!,
        redirect_uri: 'com.bubblyclouds.sudoku://-/auth',
        client_id: TEST_NATIVE_CLIENT_ID,
        code_verifier: codeVerifier,
      }).toString(),
    });

    expect(tokenRes.status).toBe(200);
    const tokenData = tokenRes.json<{ access_token: string }>();
    expect(tokenData.access_token).toBeTruthy();
  }, 60000);
});

// ─── 8. HTML responses ───────────────────────────────────────────────────────

describe('HTML responses', () => {
  it('GET /oidc/interaction/:uid renders login page with Google, Apple and email form', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${new URLSearchParams({
        response_type: 'code',
        client_id: TEST_WEB_CLIENT_ID,
        redirect_uri: 'http://localhost:3000/cb',
        scope: 'openid profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'test-html-login',
      })}`
    );
    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location as string;
    const cookies = extractCookies(authRes);

    const res = await httpRequest(
      `${testServer.baseUrl}${interactionLocation}`,
      {
        cookies,
      }
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Bubbly Clouds Sign in');
    expect(res.body).toContain('Sign in with Google');
    expect(res.body).toContain('Sign in with Apple');
    expect(res.body).toContain('your@email.com');
    expect(res.body).toContain('/federated/google');
    expect(res.body).toContain('/federated/apple');
    expect(res.body).toContain('/abort');
  }, 15000);

  it('GET /oidc/interaction/:uid renders email code entry page after email submitted', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${new URLSearchParams({
        response_type: 'code',
        client_id: TEST_WEB_CLIENT_ID,
        redirect_uri: 'http://localhost:3000/cb',
        scope: 'openid profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'test-html-email-code',
      })}`
    );
    const uid = extractInteractionUid(authRes.headers.location as string);
    let cookies = extractCookies(authRes);

    const emailRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: TEST_EMAIL }).toString(),
        cookies,
      }
    );
    cookies = extractCookies(emailRes, cookies);

    expect(emailRes.status).toBe(200);
    expect(emailRes.headers['content-type']).toContain('text/html');
    expect(emailRes.body).toContain('Enter code sent via email');
    expect(emailRes.body).toContain('XXX-XXX-XXX');
    expect(emailRes.body).toContain(TEST_EMAIL);
    // Should not show federated buttons on the code entry page
    expect(emailRes.body).not.toContain('Sign in with Google');
    expect(emailRes.body).not.toContain('Sign in with Apple');

    void cookies;
  }, 15000);

  it('native client consent page renders continue button', async () => {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authRes = await httpRequest(
      `${testServer.baseUrl}/oidc/auth?${new URLSearchParams({
        response_type: 'code',
        client_id: TEST_NATIVE_CLIENT_ID,
        redirect_uri: 'com.bubblyclouds.sudoku://-/auth',
        scope: 'openid profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'test-html-consent',
      })}`
    );
    const uid = extractInteractionUid(authRes.headers.location as string);
    let cookies = extractCookies(authRes);

    // Submit email
    const emailRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: TEST_EMAIL }).toString(),
        cookies,
      }
    );
    cookies = extractCookies(emailRes, cookies);

    // Submit code — native client requires consent next
    const codeRes = await httpRequest(
      `${testServer.baseUrl}/oidc/interaction/${uid}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: TEST_EMAIL,
          emailCode: TEST_SIGN_IN_CODE,
        }).toString(),
        cookies,
      }
    );
    cookies = extractCookies(codeRes, cookies);

    // Follow the redirect to the consent interaction page
    const consentLocation = codeRes.headers.location as string;
    const consentRes = await httpRequest(consentLocation, {
      cookies,
      followRedirects: true,
    });

    expect(consentRes.status).toBe(200);
    expect(consentRes.headers['content-type']).toContain('text/html');
    expect(consentRes.body).toContain('Press continue to return to the app.');
    expect(consentRes.body).toContain('/confirm');
    expect(consentRes.body).toContain('Switch User');
    expect(consentRes.body).toContain('/abort');
  }, 30000);
});

// ─── Shared helper ────────────────────────────────────────────────────────────

interface EmailSignInOptions {
  clientId: string;
  redirectUri: string;
  scope: string;
  resource?: string;
}

interface EmailSignInResult {
  authCode: string;
  codeVerifier: string;
  finalCookies: string;
}

/**
 * Performs the full email sign-in flow for a web client and returns the
 * authorization code and code verifier needed for the token exchange.
 */
async function performEmailSignIn(
  options: EmailSignInOptions
): Promise<EmailSignInResult> {
  const { clientId, redirectUri, scope, resource } = options;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: `test-state-${Date.now()}`,
    ...(resource ? { resource } : {}),
  });

  // Step 1: Start auth flow
  const authRes = await httpRequest(
    `${testServer.baseUrl}/oidc/auth?${authParams.toString()}`
  );
  if (authRes.status !== 303) {
    throw new Error(
      `Expected 303 from /oidc/auth, got ${authRes.status}: ${authRes.body}`
    );
  }
  const interactionLocation = authRes.headers.location as string;
  const uid = extractInteractionUid(interactionLocation);
  let cookies = extractCookies(authRes);

  // Step 2: POST email
  const emailRes = await httpRequest(
    `${testServer.baseUrl}/oidc/interaction/${uid}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: TEST_EMAIL }).toString(),
      cookies,
    }
  );
  if (emailRes.status !== 200) {
    throw new Error(
      `Expected 200 from email POST, got ${emailRes.status}: ${emailRes.body}`
    );
  }
  cookies = extractCookies(emailRes, cookies);

  // Step 3: POST email code
  const codeRes = await httpRequest(
    `${testServer.baseUrl}/oidc/interaction/${uid}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: TEST_EMAIL,
        emailCode: TEST_SIGN_IN_CODE,
      }).toString(),
      cookies,
    }
  );
  if (![302, 303].includes(codeRes.status)) {
    throw new Error(
      `Expected redirect after code POST, got ${codeRes.status}: ${codeRes.body}`
    );
  }
  cookies = extractCookies(codeRes, cookies);

  // Step 4: Follow redirects to get authorization code
  let location = codeRes.headers.location as string;
  let authCode: string | null = null;
  let maxRedirects = 10;

  while (location && maxRedirects-- > 0) {
    const redirectUrl = location.startsWith('http')
      ? location
      : `${testServer.baseUrl}${location}`;

    const parsedLocation = new URL(redirectUrl, testServer.baseUrl);
    authCode = parsedLocation.searchParams.get('code');
    if (authCode) {
      break;
    }

    const redirectRes = await httpRequest(redirectUrl, { cookies });
    cookies = extractCookies(redirectRes, cookies);

    if ([302, 303].includes(redirectRes.status)) {
      location = redirectRes.headers.location as string;
    } else {
      break;
    }
  }

  if (!authCode) {
    throw new Error('Failed to extract authorization code from redirect chain');
  }

  return { authCode, codeVerifier, finalCookies: cookies };
}

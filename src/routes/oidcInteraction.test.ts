import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Router, { type Layer } from '@koa/router';
import { IdentityProvider } from '../types/IdentityProvider';

// --- Account mock ---
const mockFindByIDP = jest.fn();
jest.unstable_mockModule('../models/account', () => ({
  Account: { findByIDP: mockFindByIDP },
}));

// --- SignInCode mock ---
const mockGetCode = jest.fn();
const mockCheckCode = jest.fn();
jest.unstable_mockModule('../lib/signInCode', () => ({
  SignInCode: jest.fn().mockImplementation(() => ({
    getCode: mockGetCode,
    checkCode: mockCheckCode,
  })),
}));

// --- Ses mock ---
const mockSendEmail = jest.fn();
jest.unstable_mockModule('../lib/ses', () => ({
  Ses: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
}));

// --- openid-client mock ---
const mockBuildAuthorizationUrl = jest.fn();
jest.unstable_mockModule('openid-client', () => ({
  buildAuthorizationUrl: mockBuildAuthorizationUrl,
}));

// --- FederatedClients mock ---
const mockGoogleIdTokenClaims = jest.fn();
const mockAppleIdTokenClaims = jest.fn();
const mockFederatedClients = {
  googleClient: jest.fn().mockResolvedValue({} as never),
  appleClient: jest.fn().mockResolvedValue({} as never),
  googleIdTokenClaims: mockGoogleIdTokenClaims,
  appleIdTokenClaims: mockAppleIdTokenClaims,
};

// --- Provider mock ---
const mockInteractionDetails = jest.fn();
const mockInteractionFinished = jest.fn();
const mockSessionAdapterDestroy = jest.fn();
const mockGrantFind = jest.fn();

const makeGrantInstance = () => ({
  addOIDCScope: jest.fn(),
  addOIDCClaims: jest.fn(),
  addResourceScope: jest.fn(),
  save: jest.fn().mockResolvedValue('new-grant-id' as never),
});

const mockGrantConstructor = jest.fn(() => makeGrantInstance());
(mockGrantConstructor as unknown as { find: typeof mockGrantFind }).find =
  mockGrantFind;
const mockClientFind = jest.fn();

const mockProvider = {
  interactionDetails: mockInteractionDetails,
  interactionFinished: mockInteractionFinished,
  Session: { adapter: { destroy: mockSessionAdapterDestroy } },
  Grant: mockGrantConstructor,
  Client: { find: mockClientFind },
};

// Helper: load oidcInteraction fresh (ESM modules cache — one load is enough)
let getRouter: () => Router;

beforeEach(async () => {
  jest.clearAllMocks();
  mockGrantConstructor.mockImplementation(() => makeGrantInstance());
  (mockGrantConstructor as unknown as { find: typeof mockGrantFind }).find =
    mockGrantFind;

  const { oidcInteraction } = await import('./oidcInteraction');
  getRouter = () =>
    oidcInteraction(
      mockProvider as never,
      { sendEmail: mockSendEmail } as never,
      { getCode: mockGetCode, checkCode: mockCheckCode } as never,
      mockFederatedClients as never
    );
});

// Helper: pull a named layer's handler(s) from the router
const getLayer = (path: string, method = 'GET') => {
  const router = getRouter();
  const layer = router.stack.find(
    (l: Layer) => l.path === path && l.methods.includes(method)
  );
  if (!layer) throw new Error(`No layer for ${method} ${path}`);
  return layer.stack;
};

const makeCtx = (overrides: Record<string, unknown> = {}) => ({
  set: jest.fn(),
  status: 0 as number,
  redirect: jest.fn(),
  response: { body: undefined as unknown, redirect: jest.fn() },
  request: { query: {}, body: {}, header: {} },
  req: {},
  res: {},
  params: {} as Record<string, string>,
  cookies: { get: jest.fn(), set: jest.fn() },
  state: { cspNonce: 'test-nonce' },
  ...overrides,
});

describe('global middleware', () => {
  it('sets cache-control: no-store and calls next', async () => {
    const router = getRouter();
    const middleware = (
      router as unknown as {
        stack: Array<{
          stack: Array<(ctx: unknown, next: () => unknown) => unknown>;
        }>;
      }
    ).stack[0].stack[0];
    const ctx = makeCtx();
    const next = jest.fn().mockResolvedValue(undefined as never);
    await middleware(ctx, next as never);
    expect(ctx.set).toHaveBeenCalledWith('cache-control', 'no-store');
    expect(next).toHaveBeenCalled();
  });

  it('rethrows errors from next', async () => {
    const router = getRouter();
    const middleware = (
      router as unknown as {
        stack: Array<{
          stack: Array<(ctx: unknown, next: () => unknown) => unknown>;
        }>;
      }
    ).stack[0].stack[0];
    const ctx = makeCtx();
    const err = new Error('downstream error');
    const next = jest.fn().mockRejectedValue(err as never);
    await expect(middleware(ctx, next as never)).rejects.toThrow(
      'downstream error'
    );
  });
});

describe('GET /interaction/:uid (login prompt)', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/:uid', 'GET');
    return layers[layers.length - 1];
  };

  it('renders login view for login prompt', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.response.body).toContain('Sign in with Google');
  });

  it('renders login view with email when bubblyEmail param provided', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client', bubblyEmail: 'user@example.com' },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);
    mockGetCode.mockResolvedValue('ABC-123' as never);
    mockSendEmail.mockResolvedValue(undefined as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockGetCode).toHaveBeenCalledWith('user@example.com');
    expect(mockSendEmail).toHaveBeenCalled();
    expect(ctx.response.body).toContain('Enter code sent via email');
  });

  it('redirects to federated provider when bubblyIdentityProvider is set', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: {
        client_id: 'web-client',
        bubblyIdentityProvider: IdentityProvider.GOOGLE,
      },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.status).toBe(303);
    expect(ctx.redirect).toHaveBeenCalledWith(
      '/oidc/interaction/test-uid/federated/google'
    );
  });

  it('renders consent view for consent prompt', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'consent' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.response.body).toContain('Press continue to return to the app');
  });

  it('calls next for unknown prompt name', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'unknown' },
      session: undefined,
    } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    const next = jest.fn().mockResolvedValue(undefined as never);
    await getHandler()(ctx as never, next as never);

    expect(next).toHaveBeenCalled();
  });
});

describe('POST /interaction/:uid (email code submission)', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/:uid', 'POST');
    return layers[layers.length - 1];
  };

  it('sends email code when email submitted without a code', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);
    mockGetCode.mockResolvedValue('XYZ-789' as never);
    mockSendEmail.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: { query: {}, body: { email: 'user@example.com' }, header: {} },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockGetCode).toHaveBeenCalledWith('user@example.com');
    expect(mockSendEmail).toHaveBeenCalled();
    expect(ctx.response.body).toContain('Enter code sent via email');
  });

  it('finishes interaction when correct code submitted', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);
    mockCheckCode.mockResolvedValue(true as never);
    mockFindByIDP.mockResolvedValue({ accountId: 'acct-123' } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { email: 'user@example.com', emailCode: 'ABC-DEF' },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockCheckCode).toHaveBeenCalledWith('user@example.com', 'ABC-DEF');
    expect(mockFindByIDP).toHaveBeenCalledWith(
      IdentityProvider.EMAIL,
      { email: 'user@example.com', email_verified: true },
      undefined
    );
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { login: { accountId: 'acct-123', remember: true } },
      { mergeWithLastSubmission: false }
    );
  });

  it('does not finish interaction when wrong code submitted', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);
    mockCheckCode.mockResolvedValue(false as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { email: 'user@example.com', emailCode: 'WRONG' },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockInteractionFinished).not.toHaveBeenCalled();
    // Still renders login with email
    expect(ctx.response.body).toContain('Enter code sent via email');
  });

  it('rejects email with double-quote to prevent injection', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client' },
      prompt: { name: 'login' },
      session: undefined,
    } as never);
    mockClientFind.mockResolvedValue({ clientName: 'Test App' } as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { email: '"evil@example.com' },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockGetCode).not.toHaveBeenCalled();
    // Falls through to login view without email
    expect(ctx.response.body).toContain('Sign in with Google');
  });
});

describe('GET /interaction/:uid (switchUser query param)', () => {
  it('destroys session and redirects when switchUser=true', async () => {
    mockInteractionDetails.mockResolvedValue({
      uid: 'test-uid',
      params: { client_id: 'web-client', response_type: 'code' },
      prompt: { name: 'login' },
      session: { cookie: 'session-cookie-id' },
    } as never);
    mockSessionAdapterDestroy.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: { query: { switchUser: 'true' }, body: {}, header: {} },
    });
    const layers = getLayer('/interaction/:uid', 'GET');
    await layers[layers.length - 1](ctx as never, jest.fn() as never);

    expect(mockSessionAdapterDestroy).toHaveBeenCalledWith('session-cookie-id');
    expect(ctx.response.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/oidc/auth?')
    );
  });
});

describe('GET /interaction/:uid/federated/google', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/:uid/federated/google', 'GET');
    return layers[layers.length - 1];
  };

  it('redirects to Google authorization URL', async () => {
    mockInteractionDetails.mockResolvedValue({
      prompt: { name: 'login' },
    } as never);
    mockBuildAuthorizationUrl.mockReturnValue(
      new URL('https://accounts.google.com/o/oauth2/auth?...')
    );

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockBuildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        state: 'test-uid',
        scope: 'openid email profile',
      })
    );
    expect(ctx.status).toBe(303);
    expect(ctx.redirect).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/auth?...'
    );
  });

  it('sets google.nonce cookie scoped to federated path', async () => {
    mockInteractionDetails.mockResolvedValue({
      prompt: { name: 'login' },
    } as never);
    mockBuildAuthorizationUrl.mockReturnValue(
      new URL('https://accounts.google.com/auth')
    );

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.cookies.set).toHaveBeenCalledWith(
      'google.nonce',
      expect.any(String),
      expect.objectContaining({
        path: '/oidc/interaction/test-uid/federated',
        sameSite: 'strict',
      })
    );
  });

  it('throws when prompt is not login', async () => {
    mockInteractionDetails.mockResolvedValue({
      prompt: { name: 'consent' },
    } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await expect(
      getHandler()(ctx as never, jest.fn() as never)
    ).rejects.toThrow('unexpected prompt');
  });
});

describe('GET /interaction/:uid/federated/apple', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/:uid/federated/apple', 'GET');
    return layers[layers.length - 1];
  };

  it('redirects to Apple authorization URL with form_post response_mode', async () => {
    mockInteractionDetails.mockResolvedValue({
      prompt: { name: 'login' },
    } as never);
    mockBuildAuthorizationUrl.mockReturnValue(
      new URL('https://appleid.apple.com/auth/authorize?...')
    );

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockBuildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        state: 'test-uid',
        scope: 'openid email',
        response_mode: 'form_post',
      })
    );
    expect(ctx.status).toBe(303);
    expect(ctx.redirect).toHaveBeenCalledWith(
      'https://appleid.apple.com/auth/authorize?...'
    );
  });

  it('sets apple.nonce cookie scoped to federated path', async () => {
    mockInteractionDetails.mockResolvedValue({
      prompt: { name: 'login' },
    } as never);
    mockBuildAuthorizationUrl.mockReturnValue(
      new URL('https://appleid.apple.com/auth')
    );

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.cookies.set).toHaveBeenCalledWith(
      'apple.nonce',
      expect.any(String),
      expect.objectContaining({
        path: '/oidc/interaction/test-uid/federated',
        sameSite: 'strict',
      })
    );
  });

  it('throws when prompt is not login', async () => {
    mockInteractionDetails.mockResolvedValue({
      prompt: { name: 'consent' },
    } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await expect(
      getHandler()(ctx as never, jest.fn() as never)
    ).rejects.toThrow('unexpected prompt');
  });
});

describe('GET /interaction/callback/google', () => {
  it('renders repost view with google upstream', async () => {
    const layers = getLayer('/interaction/callback/google', 'GET');
    const handler = layers[layers.length - 1];

    const ctx = makeCtx();
    await handler(ctx as never, jest.fn() as never);

    expect(ctx.response.body).toContain('form.submit()');
    expect(ctx.response.body).toContain(IdentityProvider.GOOGLE);
  });
});

describe('POST /interaction/callback/apple', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/callback/apple', 'POST');
    return layers[layers.length - 1];
  };

  it('renders repost view with state and code', async () => {
    const ctx = makeCtx({
      request: {
        query: {},
        body: { state: 'my-state', code: 'apple-code' },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.response.body).toContain('"state":"my-state"');
    expect(ctx.response.body).toContain('"code":"apple-code"');
    expect(ctx.response.body).toContain(IdentityProvider.APPLE);
  });

  it('throws when state or code is missing', async () => {
    const ctx = makeCtx({
      request: { query: {}, body: { state: 'only-state' }, header: {} },
    });
    await expect(
      getHandler()(ctx as never, jest.fn() as never)
    ).rejects.toThrow();
  });
});

describe('POST /interaction/:uid/federated', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/:uid/federated', 'POST');
    return layers[layers.length - 1];
  };

  it('finishes interaction after successful Google callback', async () => {
    mockGoogleIdTokenClaims.mockResolvedValue({
      claims: { email: 'user@example.com', email_verified: true },
      federatedTokens: {},
    } as never);
    mockFindByIDP.mockResolvedValue({ accountId: 'acct-google' } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { upstream: IdentityProvider.GOOGLE },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockGoogleIdTokenClaims).toHaveBeenCalled();
    expect(mockFindByIDP).toHaveBeenCalledWith(
      IdentityProvider.GOOGLE,
      expect.anything(),
      expect.anything()
    );
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { login: { accountId: 'acct-google', remember: true } },
      { mergeWithLastSubmission: false }
    );
  });

  it('clears google.nonce cookie after callback', async () => {
    mockGoogleIdTokenClaims.mockResolvedValue({
      claims: {},
      federatedTokens: {},
    } as never);
    mockFindByIDP.mockResolvedValue({ accountId: 'acct-1' } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { upstream: IdentityProvider.GOOGLE },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.cookies.set).toHaveBeenCalledWith('google.nonce', null, {
      path: '/oidc/interaction/test-uid/federated',
    });
  });

  it('finishes interaction after successful Apple callback', async () => {
    mockAppleIdTokenClaims.mockResolvedValue({
      claims: { email: 'user@apple.com', email_verified: true },
      federatedTokens: {},
    } as never);
    mockFindByIDP.mockResolvedValue({ accountId: 'acct-apple' } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { upstream: IdentityProvider.APPLE },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockAppleIdTokenClaims).toHaveBeenCalled();
    expect(mockFindByIDP).toHaveBeenCalledWith(
      IdentityProvider.APPLE,
      expect.anything(),
      expect.anything()
    );
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { login: { accountId: 'acct-apple', remember: true } },
      { mergeWithLastSubmission: false }
    );
  });

  it('clears apple.nonce cookie after callback', async () => {
    mockAppleIdTokenClaims.mockResolvedValue({
      claims: {},
      federatedTokens: {},
    } as never);
    mockFindByIDP.mockResolvedValue({ accountId: 'acct-2' } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { upstream: IdentityProvider.APPLE },
        header: {},
      },
    });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(ctx.cookies.set).toHaveBeenCalledWith('apple.nonce', null, {
      path: '/oidc/interaction/test-uid/federated',
    });
  });

  it('throws InvalidRequest when upstream is unrecognised', async () => {
    const ctx = makeCtx({
      params: { uid: 'test-uid' },
      request: {
        query: {},
        body: { upstream: 'unknown-provider' },
        header: {},
      },
    });
    await expect(
      getHandler()(ctx as never, jest.fn() as never)
    ).rejects.toThrow();
  });
});

describe('POST /interaction/:uid/confirm', () => {
  const getHandler = () => {
    const layers = getLayer('/interaction/:uid/confirm', 'POST');
    return layers[layers.length - 1];
  };

  it('creates a new grant and finishes interaction when no existing grantId', async () => {
    const grantInstance = makeGrantInstance();
    mockGrantConstructor.mockImplementation(() => grantInstance);
    mockInteractionDetails.mockResolvedValue({
      grantId: undefined,
      params: { client_id: 'web-client' },
      session: { accountId: 'acct-123' },
      prompt: {
        name: 'consent',
        details: {
          missingOIDCScope: ['openid'],
          missingOIDCClaims: [],
          missingResourceScopes: {},
        },
      },
    } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(grantInstance.addOIDCScope).toHaveBeenCalledWith('openid');
    expect(grantInstance.save).toHaveBeenCalled();
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { consent: { grantId: 'new-grant-id' } },
      { mergeWithLastSubmission: true }
    );
  });

  it('loads existing grant when grantId is present', async () => {
    const grantInstance = makeGrantInstance();
    mockGrantFind.mockResolvedValue(grantInstance as never);
    mockInteractionDetails.mockResolvedValue({
      grantId: 'existing-grant',
      params: { client_id: 'web-client' },
      session: { accountId: 'acct-123' },
      prompt: {
        name: 'consent',
        details: {
          missingOIDCScope: [],
          missingOIDCClaims: [],
          missingResourceScopes: {},
        },
      },
    } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(mockGrantFind).toHaveBeenCalledWith('existing-grant');
    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { consent: {} },
      { mergeWithLastSubmission: true }
    );
  });

  it('adds missing resource scopes to grant', async () => {
    const grantInstance = makeGrantInstance();
    mockGrantConstructor.mockImplementation(() => grantInstance);
    mockInteractionDetails.mockResolvedValue({
      grantId: undefined,
      params: { client_id: 'web-client' },
      session: { accountId: 'acct-123' },
      prompt: {
        name: 'consent',
        details: {
          missingOIDCScope: [],
          missingOIDCClaims: [],
          missingResourceScopes: {
            'https://api.example.com': ['read', 'write'],
          },
        },
      },
    } as never);
    mockInteractionFinished.mockResolvedValue(undefined as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await getHandler()(ctx as never, jest.fn() as never);

    expect(grantInstance.addResourceScope).toHaveBeenCalledWith(
      'https://api.example.com',
      'read write'
    );
  });

  it('throws when prompt is not consent', async () => {
    mockInteractionDetails.mockResolvedValue({
      grantId: undefined,
      params: { client_id: 'web-client' },
      session: { accountId: 'acct-123' },
      prompt: { name: 'login', details: {} },
    } as never);

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await expect(
      getHandler()(ctx as never, jest.fn() as never)
    ).rejects.toThrow('unexpected prompt');
  });
});

describe('GET /interaction/:uid/abort', () => {
  it('finishes interaction with access_denied error', async () => {
    mockInteractionFinished.mockResolvedValue(undefined as never);
    const layers = getLayer('/interaction/:uid/abort', 'GET');
    const handler = layers[layers.length - 1];

    const ctx = makeCtx({ params: { uid: 'test-uid' } });
    await handler(ctx as never, jest.fn() as never);

    expect(mockInteractionFinished).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        error: 'access_denied',
        error_description: 'End-User aborted interaction',
      },
      { mergeWithLastSubmission: false }
    );
  });
});

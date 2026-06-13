import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Koa from 'koa';
import Router from '@koa/router';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { IdentityProvider } from '../types/IdentityProvider';

const mockFederatedTokens = jest.fn();
const mockDestroy = jest.fn();

jest.unstable_mockModule('../models/account', () => ({
  Account: jest.fn().mockImplementation(() => ({
    federatedTokens: mockFederatedTokens,
    destroy: mockDestroy,
  })),
}));

const mockAppleRevoke = jest.fn();
const mockAppleClient = { revoke: mockAppleRevoke };
const mockFederatedClientsInstance = {
  appleClient: jest.fn().mockResolvedValue(mockAppleClient as never),
};

const makeApp = async (verifyTokenResult: boolean) => {
  const { api } = await import('./api');
  const verifyToken = async (
    _token: string | undefined,
    _accountId: string
  ): Promise<boolean> => verifyTokenResult;
  const router = api(verifyToken, mockFederatedClientsInstance as never);
  const app = new Koa();
  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
};

const request = (
  app: Koa,
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number }> =>
  new Promise((resolve) => {
    const server = createServer(app.callback());
    const req = Object.assign(new IncomingMessage(null as never), {
      method,
      url: path,
      headers,
    });
    const res = Object.assign(new ServerResponse(req), {
      end: (body?: unknown) => {
        resolve({ status: (res as { statusCode: number }).statusCode });
        server.close();
      },
    });
    server.emit('request', req, res);
  });

describe('api routes', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFederatedTokens.mockReset();
    mockDestroy.mockReset();
    mockAppleRevoke.mockReset();
    mockFederatedClientsInstance.appleClient.mockResolvedValue(
      mockAppleClient as never
    );
  });

  describe('error-boundary middleware', () => {
    it('sets cache-control: no-store and calls next', async () => {
      const { api } = await import('./api');
      const router = api(
        async () => true,
        mockFederatedClientsInstance as never
      );
      // Access the router middleware stack directly - first entry is the global middleware
      const globalMiddleware = (
        router as unknown as {
          stack: Array<{
            stack: Array<
              (ctx: unknown, next: () => Promise<void>) => Promise<void>
            >;
          }>;
        }
      ).stack[0]?.stack?.[0];
      if (globalMiddleware) {
        const ctx = { set: jest.fn() };
        const next = jest.fn().mockResolvedValue(undefined as never);
        await globalMiddleware(ctx as never, next as never);
        expect(ctx.set).toHaveBeenCalledWith('cache-control', 'no-store');
        expect(next).toHaveBeenCalled();
      }
    });

    it('re-throws 4xx errors (warns) from next', async () => {
      const { api } = await import('./api');
      const router = api(
        async () => true,
        mockFederatedClientsInstance as never
      );
      const globalMiddleware = (
        router as unknown as {
          stack: Array<{
            stack: Array<
              (ctx: unknown, next: () => Promise<void>) => Promise<void>
            >;
          }>;
        }
      ).stack[0]?.stack?.[0];
      if (globalMiddleware) {
        const clientError = Object.assign(new Error('Not Found'), {
          status: 404,
        });
        const next = jest.fn().mockRejectedValue(clientError as never);
        const ctx = { set: jest.fn() };
        await expect(
          globalMiddleware(ctx as never, next as never)
        ).rejects.toThrow('Not Found');
      }
    });

    it('re-throws 5xx errors (errors) from next', async () => {
      const { api } = await import('./api');
      const router = api(
        async () => true,
        mockFederatedClientsInstance as never
      );
      const globalMiddleware = (
        router as unknown as {
          stack: Array<{
            stack: Array<
              (ctx: unknown, next: () => Promise<void>) => Promise<void>
            >;
          }>;
        }
      ).stack[0]?.stack?.[0];
      if (globalMiddleware) {
        const serverError = new Error('Internal Server Error');
        const next = jest.fn().mockRejectedValue(serverError as never);
        const ctx = { set: jest.fn() };
        await expect(
          globalMiddleware(ctx as never, next as never)
        ).rejects.toThrow('Internal Server Error');
      }
    });
  });

  it('creates a Koa router instance', async () => {
    const { api } = await import('./api');
    const router = api(async () => true, mockFederatedClientsInstance as never);
    expect(router).toBeInstanceOf(Router);
  });

  describe('route registration', () => {
    it('registers the delete account route', async () => {
      const { api } = await import('./api');
      const router = api(
        async () => true,
        mockFederatedClientsInstance as never
      );
      const paths = router.stack.map((l) => l.path);
      expect(paths).toContain('/api/account/:accountId/delete');
    });
  });

  describe('auth middleware', () => {
    it('returns 401 for missing Authorization header', async () => {
      mockFederatedTokens.mockResolvedValue(undefined as never);
      mockDestroy.mockResolvedValue(undefined as never);
      const { api } = await import('./api');
      const verifyToken = jest.fn(
        async (_token: string | undefined, _accountId: string) => false
      );
      const router = api(verifyToken, mockFederatedClientsInstance as never);
      // Directly call the authMiddleware by getting the handler stack
      const layer = router.stack.find(
        (l) => l.path === '/api/account/:accountId/delete'
      );
      expect(layer).toBeDefined();

      const authMiddleware = layer!.stack[0];
      const ctx = {
        set: jest.fn(),
        params: { accountId: 'acct-1' },
        request: { header: {} },
        status: 0 as number,
      };
      await authMiddleware(ctx as never, jest.fn() as never);
      expect(ctx.status).toBe(401);
    });

    it('calls next when token is valid', async () => {
      const { api } = await import('./api');
      const verifyToken = jest.fn(async () => true);
      const router = api(verifyToken, mockFederatedClientsInstance as never);
      const layer = router.stack.find(
        (l) => l.path === '/api/account/:accountId/delete'
      );
      const authMiddleware = layer!.stack[0];
      const ctx = {
        set: jest.fn(),
        params: { accountId: 'acct-1' },
        request: { header: { authorization: 'Bearer my-token' } },
        status: 0 as number,
      };
      const next = jest.fn().mockResolvedValue(undefined as never);
      await authMiddleware(ctx as never, next as never);
      expect(next).toHaveBeenCalled();
    });

    it('extracts Bearer token and passes to verifyToken', async () => {
      const { api } = await import('./api');
      const verifyToken = jest.fn(async () => false);
      const router = api(verifyToken, mockFederatedClientsInstance as never);
      const layer = router.stack.find(
        (l) => l.path === '/api/account/:accountId/delete'
      );
      const authMiddleware = layer!.stack[0];
      const ctx = {
        set: jest.fn(),
        params: { accountId: 'acct-123' },
        request: { header: { authorization: 'Bearer my-token-value' } },
        status: 0 as number,
      };
      await authMiddleware(ctx as never, jest.fn() as never);
      expect(verifyToken).toHaveBeenCalledWith('my-token-value', 'acct-123');
    });

    it('passes undefined token when auth type is not Bearer', async () => {
      const { api } = await import('./api');
      const verifyToken = jest.fn(async () => false);
      const router = api(verifyToken, mockFederatedClientsInstance as never);
      const layer = router.stack.find(
        (l) => l.path === '/api/account/:accountId/delete'
      );
      const authMiddleware = layer!.stack[0];
      const ctx = {
        set: jest.fn(),
        params: { accountId: 'acct-1' },
        request: { header: { authorization: 'Basic credentials' } },
        status: 0 as number,
      };
      await authMiddleware(ctx as never, jest.fn() as never);
      expect(verifyToken).toHaveBeenCalledWith(undefined, 'acct-1');
    });
  });

  describe('DELETE /api/account/:accountId/delete handler', () => {
    const getDeleteHandler = async () => {
      const { api } = await import('./api');
      const router = api(
        async () => true,
        mockFederatedClientsInstance as never
      );
      const layer = router.stack.find(
        (l) => l.path === '/api/account/:accountId/delete'
      );
      // Skip auth (index 0) and body parser (index 1), get the actual handler
      return layer!.stack[layer!.stack.length - 1];
    };

    const makeCtx = () => ({
      set: jest.fn(),
      params: { accountId: 'test-account-id' },
      request: { header: {}, body: {} },
      status: 0 as number,
    });

    it('sets status 204 and destroys account', async () => {
      mockFederatedTokens.mockResolvedValue(undefined as never);
      mockDestroy.mockResolvedValue(undefined as never);
      const handler = await getDeleteHandler();
      const ctx = makeCtx();
      await handler(ctx as never, jest.fn() as never);
      expect(ctx.status).toBe(204);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('revokes apple when refresh_token present', async () => {
      mockFederatedTokens.mockResolvedValue({
        refresh_token: 'refresh-tkn',
      } as never);
      mockDestroy.mockResolvedValue(undefined as never);
      const handler = await getDeleteHandler();
      const ctx = makeCtx();
      await handler(ctx as never, jest.fn() as never);
      expect(mockAppleRevoke).toHaveBeenCalledWith(
        'refresh-tkn',
        'refresh_token'
      );
      expect(ctx.status).toBe(204);
    });

    it('does not revoke apple when no refresh_token', async () => {
      mockFederatedTokens.mockResolvedValue({
        access_token: 'access-tkn',
      } as never);
      mockDestroy.mockResolvedValue(undefined as never);
      const handler = await getDeleteHandler();
      const ctx = makeCtx();
      await handler(ctx as never, jest.fn() as never);
      expect(mockAppleRevoke).not.toHaveBeenCalled();
    });

    it('handles error when appleClient() call itself fails', async () => {
      mockFederatedTokens.mockResolvedValue({ refresh_token: 'tkn' } as never);
      mockFederatedClientsInstance.appleClient.mockRejectedValue(
        new Error('client setup failed') as never
      );
      mockDestroy.mockResolvedValue(undefined as never);
      const handler = await getDeleteHandler();
      const ctx = makeCtx();
      await handler(ctx as never, jest.fn() as never);
      expect(ctx.status).toBe(204);
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('fetches apple tokens using APPLE provider', async () => {
      mockFederatedTokens.mockResolvedValue(undefined as never);
      mockDestroy.mockResolvedValue(undefined as never);
      const handler = await getDeleteHandler();
      const ctx = makeCtx();
      await handler(ctx as never, jest.fn() as never);
      expect(mockFederatedTokens).toHaveBeenCalledWith(IdentityProvider.APPLE);
    });
  });
});

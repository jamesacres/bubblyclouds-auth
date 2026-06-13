import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGoogleClient = {
  callback: jest.fn(),
  authorizationUrl: jest
    .fn()
    .mockReturnValue('https://accounts.google.com/oauth2/auth'),
};

const mockAppleClient = {
  callback: jest.fn(),
  authorizationUrl: jest
    .fn()
    .mockReturnValue('https://appleid.apple.com/auth/authorize'),
};

jest.unstable_mockModule('./google', () => ({
  getGoogleClient: jest.fn().mockResolvedValue(mockGoogleClient as never),
}));

jest.unstable_mockModule('./apple', () => ({
  getAppleClient: jest.fn().mockResolvedValue(mockAppleClient as never),
}));

jest.unstable_mockModule('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({} as never),
  })),
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn().mockReturnValue('signed-jwt-secret'),
  },
}));

const testConfig = {
  federatedClients: {
    google: { clientId: 'google-client-id' },
    apple: {
      clientId: 'com.test.app',
      privateKey: 'ec-private-key',
      teamId: 'TEAM123',
      keyId: 'KEY456',
    },
  },
  serverUrl: 'https://auth.example.com',
  serverUrlProd: 'https://auth.example.com',
};

describe('FederatedClients', () => {
  let FederatedClients: typeof import('./federatedClients').FederatedClients;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGoogleClient.callback.mockReset();
    mockAppleClient.callback.mockReset();
    ({ FederatedClients } = await import('./federatedClients'));
  });

  describe('googleClient', () => {
    it('returns a google client', async () => {
      const fc = new FederatedClients(testConfig);
      const client = await fc.googleClient();
      expect(client).toBe(mockGoogleClient);
    });

    it('caches the client on subsequent calls', async () => {
      const { getGoogleClient } = await import('./google');
      const fc = new FederatedClients(testConfig);
      await fc.googleClient();
      await fc.googleClient();
      expect(getGoogleClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('googleIdTokenClaims', () => {
    it('returns claims and federatedTokens on success', async () => {
      const mockClaims = {
        email: 'user@gmail.com',
        email_verified: true,
        sub: 'google-sub',
      };
      const mockTokenSet = {
        id_token: 'google-id-token',
        access_token: 'google-access-token',
        token_type: 'Bearer',
        refresh_token: undefined,
        scope: 'openid email',
        expires_at: 1234567890,
        session_state: undefined,
        claims: jest.fn().mockReturnValue(mockClaims),
      };
      mockGoogleClient.callback.mockResolvedValue(mockTokenSet as never);

      const fc = new FederatedClients(testConfig);
      const result = await fc.googleIdTokenClaims('nonce-val', 'uid-val', {});
      expect(result.claims).toEqual(mockClaims);
      expect(result.federatedTokens.id_token).toBe('google-id-token');
    });

    it('throws InvalidToken when callback fails', async () => {
      mockGoogleClient.callback.mockRejectedValue(
        new Error('invalid token') as never
      );
      const fc = new FederatedClients(testConfig);
      await expect(
        fc.googleIdTokenClaims('nonce', 'uid', {})
      ).rejects.toThrow();
    });
  });

  describe('appleClient', () => {
    it('returns an apple client', async () => {
      const fc = new FederatedClients(testConfig);
      const client = await fc.appleClient();
      expect(client).toBe(mockAppleClient);
    });

    it('caches the client on subsequent calls', async () => {
      const { getAppleClient } = await import('./apple');
      const fc = new FederatedClients(testConfig);
      await fc.appleClient();
      await fc.appleClient();
      expect(getAppleClient).toHaveBeenCalledTimes(1);
    });

    it('uses serverUrlProd for apple callback when provided', async () => {
      const { getAppleClient } = await import('./apple');
      const fc = new FederatedClients({
        ...testConfig,
        serverUrlProd: 'https://prod.auth.example.com',
      });
      await fc.appleClient();
      expect(getAppleClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.stringContaining('prod.auth.example.com')
      );
    });

    it('uses serverUrl for apple callback when serverUrlProd not provided', async () => {
      const { getAppleClient } = await import('./apple');
      const fc = new FederatedClients({
        ...testConfig,
        serverUrlProd: undefined,
      });
      await fc.appleClient();
      expect(getAppleClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.stringContaining('auth.example.com')
      );
    });

    it('signs JWT secret with correct claims for apple', async () => {
      const jwt = await import('jsonwebtoken');
      const fc = new FederatedClients(testConfig);
      await fc.appleClient();
      expect(jwt.default.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          iss: 'TEAM123',
          sub: 'com.test.app',
          aud: 'https://appleid.apple.com',
        }),
        'ec-private-key',
        expect.objectContaining({
          algorithm: 'ES256',
          header: expect.objectContaining({ kid: 'KEY456' }),
        })
      );
    });
  });

  describe('appleIdTokenClaims', () => {
    it('returns claims and federatedTokens on success', async () => {
      const mockClaims = {
        email: 'user@privaterelay.appleid.com',
        email_verified: true,
        sub: 'apple-sub',
      };
      const mockTokenSet = {
        id_token: 'apple-id-token',
        access_token: undefined,
        token_type: 'Bearer',
        refresh_token: 'apple-refresh-token',
        scope: undefined,
        expires_at: undefined,
        session_state: undefined,
        claims: jest.fn().mockReturnValue(mockClaims),
      };
      mockAppleClient.callback.mockResolvedValue(mockTokenSet as never);

      const fc = new FederatedClients(testConfig);
      const result = await fc.appleIdTokenClaims('nonce-val', 'uid-val', {});
      expect(result.claims).toEqual(mockClaims);
      expect(result.federatedTokens.id_token).toBe('apple-id-token');
      expect(result.federatedTokens.refresh_token).toBe('apple-refresh-token');
    });

    it('throws when apple callback fails', async () => {
      mockAppleClient.callback.mockRejectedValue(new Error('invalid') as never);
      const fc = new FederatedClients(testConfig);
      await expect(fc.appleIdTokenClaims('nonce', 'uid', {})).rejects.toThrow();
    });
  });
});

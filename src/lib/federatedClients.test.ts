import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGoogleConfig = {};
const mockAppleConfig = {};

const mockImplicitAuthentication = jest.fn();
const mockAuthorizationCodeGrant = jest.fn();

jest.unstable_mockModule('./google', () => ({
  getGoogleClient: jest.fn().mockResolvedValue(mockGoogleConfig as never),
}));

jest.unstable_mockModule('./apple', () => ({
  getAppleClient: jest.fn().mockResolvedValue(mockAppleConfig as never),
}));

jest.unstable_mockModule('openid-client', () => ({
  implicitAuthentication: mockImplicitAuthentication,
  authorizationCodeGrant: mockAuthorizationCodeGrant,
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
    mockImplicitAuthentication.mockReset();
    mockAuthorizationCodeGrant.mockReset();
    ({ FederatedClients } = await import('./federatedClients'));
  });

  describe('googleClient', () => {
    it('returns a google client', async () => {
      const fc = new FederatedClients(testConfig);
      const client = await fc.googleClient();
      expect(client).toBe(mockGoogleConfig);
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
      mockImplicitAuthentication.mockResolvedValue(mockClaims as never);

      const fc = new FederatedClients(testConfig);
      const result = await fc.googleIdTokenClaims('nonce-val', 'uid-val', {
        id_token: 'google-id-token',
      });
      expect(result.claims).toEqual(mockClaims);
      expect(result.federatedTokens.id_token).toBe('google-id-token');
    });

    it('returns claims and federatedTokens for a realistic Google callback', async () => {
      const nonce =
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const uid = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345678901234';
      const callbackBody = {
        state: uid,
        iss: 'https://accounts.google.com',
        id_token:
          'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIiwidHlwIjoiSldUIn0.' +
          'eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJzdWIiOiIxMjM0NTY3ODkwIiwiZW1haWwiOiJ0ZXN0dXNlckBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibm9uY2UiOiJhMWIyYzNkNGU1ZjZhMWIyYzNkNGU1ZjZhMWIyYzNkNGU1ZjZhMWIyYzNkNGU1ZjZhMWIyYzNkNGU1ZjZhMWIyIiwibmFtZSI6IlRlc3QgVXNlciIsImdpdmVuX25hbWUiOiJUZXN0IiwiZmFtaWx5X25hbWUiOiJVc2VyIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDB9.' +
          'mock-signature',
        authuser: '0',
        prompt: 'none',
        upstream: 'google',
      };
      const mockClaims = {
        iss: 'https://accounts.google.com',
        sub: '1234567890',
        email: 'testuser@gmail.com',
        email_verified: true,
        nonce,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        iat: 1700000000,
        exp: 1700003600,
      };
      mockImplicitAuthentication.mockResolvedValue(mockClaims as never);

      const fc = new FederatedClients(testConfig);
      const result = await fc.googleIdTokenClaims(nonce, uid, callbackBody);

      expect(result.claims).toEqual(mockClaims);
      expect(result.federatedTokens.id_token).toBe(callbackBody.id_token);
      expect(mockImplicitAuthentication).toHaveBeenCalledWith(
        mockGoogleConfig,
        expect.objectContaining({ hash: expect.stringContaining(uid) }),
        nonce,
        { expectedState: uid }
      );
    });

    it('throws InvalidToken when implicitAuthentication fails', async () => {
      mockImplicitAuthentication.mockRejectedValue(
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
      expect(client).toBe(mockAppleConfig);
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
        expires_in: undefined,
        claims: jest.fn().mockReturnValue(mockClaims),
      };
      mockAuthorizationCodeGrant.mockResolvedValue(mockTokenSet as never);

      const fc = new FederatedClients(testConfig);
      const result = await fc.appleIdTokenClaims('nonce-val', 'uid-val', {
        code: 'apple-code',
        state: 'uid-val',
      });
      expect(result.claims).toEqual(mockClaims);
      expect(result.federatedTokens.id_token).toBe('apple-id-token');
      expect(result.federatedTokens.refresh_token).toBe('apple-refresh-token');
    });

    it('returns claims and federatedTokens for a realistic Apple form_post callback', async () => {
      const nonce =
        'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3';
      const uid = 'BcDeFgHiJkLmNoPqRsTuVwXyZ012345678901234';
      const callbackBody = {
        state: uid,
        code: 'a1b2c3.mock-apple-auth-code.d4e5f6',
        upstream: 'apple',
      };
      const mockClaims = {
        iss: 'https://appleid.apple.com',
        sub: '000111.abcdef1234567890abcdef1234567890.1234',
        email: 'testuser@privaterelay.appleid.com',
        email_verified: true,
        nonce,
        iat: 1700000000,
        exp: 1700003600,
      };
      const mockTokenSet = {
        id_token:
          'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.mock-apple-payload.mock-sig',
        access_token: 'mock-apple-access-token',
        token_type: 'Bearer',
        refresh_token: 'mock-apple-refresh-token',
        scope: undefined,
        expires_in: 3600,
        claims: jest.fn().mockReturnValue(mockClaims),
      };
      mockAuthorizationCodeGrant.mockResolvedValue(mockTokenSet as never);

      const fc = new FederatedClients(testConfig);
      const result = await fc.appleIdTokenClaims(nonce, uid, callbackBody);

      expect(result.claims).toEqual(mockClaims);
      expect(result.federatedTokens.id_token).toBe(mockTokenSet.id_token);
      expect(result.federatedTokens.access_token).toBe(
        mockTokenSet.access_token
      );
      expect(result.federatedTokens.refresh_token).toBe(
        mockTokenSet.refresh_token
      );
      expect(result.federatedTokens.expires_at).toBeDefined();
      expect(mockAuthorizationCodeGrant).toHaveBeenCalledWith(
        mockAppleConfig,
        expect.objectContaining({
          href: expect.stringContaining(uid),
        }),
        { expectedNonce: nonce, expectedState: uid }
      );
    });

    it('throws when apple authorizationCodeGrant fails', async () => {
      mockAuthorizationCodeGrant.mockRejectedValue(
        new Error('invalid') as never
      );
      const fc = new FederatedClients(testConfig);
      await expect(fc.appleIdTokenClaims('nonce', 'uid', {})).rejects.toThrow();
    });
  });
});

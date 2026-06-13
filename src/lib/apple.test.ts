import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockClient = { client_id: 'com.test.app' };
const mockAppleIssuer = { Client: jest.fn().mockReturnValue(mockClient) };
const mockDiscover = jest.fn().mockResolvedValue(mockAppleIssuer as never);

jest.unstable_mockModule('openid-client', () => ({
  default: {
    Issuer: {
      discover: mockDiscover,
    },
  },
}));

describe('getAppleClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockAppleIssuer.Client.mockReturnValue(mockClient);
    mockDiscover.mockResolvedValue(mockAppleIssuer as never);
  });

  it('returns an openid-client Client instance', async () => {
    const { getAppleClient } = await import('./apple');
    const client = await getAppleClient(
      'com.test.app',
      'secret-jwt',
      'https://example.com/callback/apple'
    );
    expect(client).toBe(mockClient);
  });

  it('discovers Apple OIDC configuration', async () => {
    const { getAppleClient } = await import('./apple');
    await getAppleClient(
      'com.test.app',
      'secret',
      'https://example.com/cb/apple'
    );
    expect(mockDiscover).toHaveBeenCalledWith(
      'https://appleid.apple.com/.well-known/openid-configuration'
    );
  });

  it('creates client with correct config', async () => {
    const { getAppleClient } = await import('./apple');
    await getAppleClient(
      'com.test.app',
      'my-secret',
      'https://example.com/cb/apple'
    );
    expect(mockAppleIssuer.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'com.test.app',
        client_secret: 'my-secret',
        redirect_uris: ['https://example.com/cb/apple'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
      })
    );
  });
});

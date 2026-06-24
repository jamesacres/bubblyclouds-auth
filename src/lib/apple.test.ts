import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockConfig = { clientId: 'com.test.app' };
const mockDiscovery = jest.fn().mockResolvedValue(mockConfig as never);

jest.unstable_mockModule('openid-client', () => ({
  discovery: mockDiscovery,
  ClientSecretPost: jest.fn().mockReturnValue({}),
}));

describe('getAppleClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockDiscovery.mockResolvedValue(mockConfig as never);
  });

  it('returns an openid-client Configuration instance', async () => {
    const { getAppleClient } = await import('./apple');
    const client = await getAppleClient(
      'com.test.app',
      'secret-jwt',
      'https://example.com/callback/apple'
    );
    expect(client).toBe(mockConfig);
  });

  it('discovers Apple OIDC configuration', async () => {
    const { getAppleClient } = await import('./apple');
    await getAppleClient(
      'com.test.app',
      'secret',
      'https://example.com/cb/apple'
    );
    expect(mockDiscovery).toHaveBeenCalledWith(
      new URL('https://appleid.apple.com/.well-known/openid-configuration'),
      'com.test.app',
      expect.objectContaining({
        client_secret: 'secret',
        redirect_uris: ['https://example.com/cb/apple'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
      }),
      expect.anything()
    );
  });

  it('creates config with correct client ID and secret', async () => {
    const { getAppleClient } = await import('./apple');
    await getAppleClient(
      'com.test.app',
      'my-secret',
      'https://example.com/cb/apple'
    );
    expect(mockDiscovery).toHaveBeenCalledWith(
      new URL('https://appleid.apple.com/.well-known/openid-configuration'),
      'com.test.app',
      expect.objectContaining({
        client_secret: 'my-secret',
      }),
      expect.anything()
    );
  });
});

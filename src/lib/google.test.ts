import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockConfig = { clientId: 'test-google.apps.googleusercontent.com' };
const mockDiscovery = jest.fn().mockResolvedValue(mockConfig as never);

jest.unstable_mockModule('openid-client', () => ({
  discovery: mockDiscovery,
  useIdTokenResponseType: jest.fn(),
}));

describe('getGoogleClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockDiscovery.mockResolvedValue(mockConfig as never);
  });

  it('returns an openid-client Configuration instance', async () => {
    const { getGoogleClient } = await import('./google');
    const client = await getGoogleClient(
      'test-google.apps.googleusercontent.com',
      'https://example.com/callback/google'
    );
    expect(client).toBe(mockConfig);
  });

  it('discovers Google OIDC configuration', async () => {
    const { getGoogleClient } = await import('./google');
    await getGoogleClient('clientId', 'https://example.com/cb/google');
    expect(mockDiscovery).toHaveBeenCalledWith(
      new URL('https://accounts.google.com/.well-known/openid-configuration'),
      'clientId',
      expect.objectContaining({
        redirect_uris: ['https://example.com/cb/google'],
        grant_types: ['implicit'],
        response_types: ['id_token'],
      })
    );
  });

  it('creates config with correct client ID', async () => {
    const { getGoogleClient } = await import('./google');
    await getGoogleClient('my-client-id', 'https://example.com/cb/google');
    expect(mockDiscovery).toHaveBeenCalledWith(
      new URL('https://accounts.google.com/.well-known/openid-configuration'),
      'my-client-id',
      expect.objectContaining({
        redirect_uris: ['https://example.com/cb/google'],
      })
    );
  });
});

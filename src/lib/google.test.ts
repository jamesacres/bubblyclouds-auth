import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockClient = { client_id: 'test-google.apps.googleusercontent.com' };
const mockGoogleIssuer = { Client: jest.fn().mockReturnValue(mockClient) };
const mockDiscover = jest.fn().mockResolvedValue(mockGoogleIssuer as never);

jest.unstable_mockModule('openid-client', () => ({
  default: {
    Issuer: {
      discover: mockDiscover,
    },
  },
}));

describe('getGoogleClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockGoogleIssuer.Client.mockReturnValue(mockClient);
    mockDiscover.mockResolvedValue(mockGoogleIssuer as never);
  });

  it('returns an openid-client Client instance', async () => {
    const { getGoogleClient } = await import('./google');
    const client = await getGoogleClient(
      'test-google.apps.googleusercontent.com',
      'https://example.com/callback/google'
    );
    expect(client).toBe(mockClient);
  });

  it('discovers Google OIDC configuration', async () => {
    const { getGoogleClient } = await import('./google');
    await getGoogleClient('clientId', 'https://example.com/cb/google');
    expect(mockDiscover).toHaveBeenCalledWith(
      'https://accounts.google.com/.well-known/openid-configuration'
    );
  });

  it('creates client with correct config', async () => {
    const { getGoogleClient } = await import('./google');
    await getGoogleClient('my-client-id', 'https://example.com/cb/google');
    expect(mockGoogleIssuer.Client).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'my-client-id',
        redirect_uris: ['https://example.com/cb/google'],
        grant_types: ['implicit'],
        response_types: ['id_token'],
      })
    );
  });
});

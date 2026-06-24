import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('getSecret', () => {
  beforeEach(() => {
    process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = '2773';
    process.env.AWS_SESSION_TOKEN = 'test-token';
  });

  const makeFetch = (ok: boolean, body: unknown, status = 200) =>
    jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({
      ok,
      status,
      json: async () => body,
    })) as unknown as typeof fetch;

  it('returns SecretString on success', async () => {
    global.fetch = makeFetch(true, { SecretString: 'my-secret' });
    const { getSecret } = await import('./secrets');
    const result = await getSecret('my-secret-id');
    expect(result).toBe('my-secret');
  });

  it('returns empty string when SecretString is missing', async () => {
    global.fetch = makeFetch(true, {});
    const { getSecret } = await import('./secrets');
    const result = await getSecret('my-secret-id');
    expect(result).toBe('');
  });

  it('throws on non-ok response', async () => {
    global.fetch = makeFetch(false, { message: 'Forbidden' }, 403);
    const { getSecret } = await import('./secrets');
    await expect(getSecret('my-secret-id')).rejects.toThrow(
      'Invalid 403 response'
    );
  });

  it('includes the secretId in the URL', async () => {
    const mockFetch = makeFetch(true, { SecretString: 'val' });
    global.fetch = mockFetch;
    const { getSecret } = await import('./secrets');
    await getSecret('my-secret-id');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('my-secret-id'),
      expect.anything()
    );
  });

  it('sends the AWS session token header', async () => {
    const mockFetch = makeFetch(true, { SecretString: 'val' });
    global.fetch = mockFetch;
    const { getSecret } = await import('./secrets');
    await getSecret('my-secret-id');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Aws-Parameters-Secrets-Token': 'test-token',
        }),
      })
    );
  });

  it('re-throws fetch errors', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new Error('Network error') as never
      ) as unknown as typeof fetch;
    const { getSecret } = await import('./secrets');
    await expect(getSecret('any')).rejects.toThrow('Network error');
  });
});

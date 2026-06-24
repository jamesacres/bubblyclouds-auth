import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSend = jest.fn();
const mockBackOff = jest.fn();

jest.unstable_mockModule('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.unstable_mockModule('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn().mockImplementation(() => ({ send: mockSend })),
  },
  UpdateCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  GetCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  QueryCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  DeleteCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  BatchWriteCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

jest.unstable_mockModule('exponential-backoff', () => ({
  backOff: mockBackOff,
}));

describe('DynamoDBAdapter', () => {
  let DynamoDBAdapter: typeof import('./dynamodb').DynamoDBAdapter;
  let Model: typeof import('../types/Model').Model;
  let libDynamodb: typeof import('@aws-sdk/lib-dynamodb');

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBackOff.mockImplementation(async (fn: unknown) =>
      (fn as () => unknown)()
    );
    mockSend.mockReset();

    ({ DynamoDBAdapter } = await import('./dynamodb'));
    ({ Model } = await import('../types/Model'));
    libDynamodb = await import('@aws-sdk/lib-dynamodb');

    DynamoDBAdapter.configure({
      tableName: 'test-table',
      region: 'us-east-1',
    });
  });

  describe('configure', () => {
    it('accepts valid config without throwing', () => {
      expect(() =>
        DynamoDBAdapter.configure({ tableName: 'tbl', region: 'us-east-1' })
      ).not.toThrow();
    });

    it('supports endpoint for local development', () => {
      expect(() =>
        DynamoDBAdapter.configure({
          tableName: 'tbl',
          region: 'us-east-1',
          endpoint: 'http://localhost:8000',
        })
      ).not.toThrow();
    });
  });

  describe('upsert', () => {
    it('calls send with UpdateCommand', async () => {
      mockSend.mockResolvedValue(undefined as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      await adapter.upsert('user-id', {
        profile: {
          sub: 'user-id',
          email: 'a@b.com',
          email_verified: true,
          name: 'Test',
        },
      });
      expect(mockSend).toHaveBeenCalled();
    });

    it('includes expiresAt when expiresIn provided', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.UpdateCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter(Model.BubblySignInCode);
      await adapter.upsert('code-id', { signInCode: 'ABC-DEF-GHI' }, 3600);
      const callArg = (libDynamodb.UpdateCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        UpdateExpression: string;
      };
      expect(callArg.UpdateExpression).toContain('expiresAt');
    });

    it('does not include expiresAt when expiresIn is not provided', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.UpdateCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      await adapter.upsert('user-id', {});
      const callArg = (libDynamodb.UpdateCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        UpdateExpression: string;
      };
      expect(callArg.UpdateExpression).not.toContain('expiresAt');
    });

    it('includes uid in expression when payload has uid', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.UpdateCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      await adapter.upsert('sub-id', { uid: 'user@example.com' });
      const callArg = (libDynamodb.UpdateCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        UpdateExpression: string;
      };
      expect(callArg.UpdateExpression).toContain('uid');
    });

    it('includes grantId in expression when payload has grantId', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.UpdateCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter('Grant');
      await adapter.upsert('grant-id', { grantId: 'the-grant-id' });
      const callArg = (libDynamodb.UpdateCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        UpdateExpression: string;
      };
      expect(callArg.UpdateExpression).toContain('grantId');
    });

    it('uses name-id as modelId key', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.UpdateCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      await adapter.upsert('user-123', {});
      const callArg = (libDynamodb.UpdateCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        Key: { modelId: string };
      };
      expect(callArg.Key.modelId).toBe(`${Model.BubblyUser}-user-123`);
    });
  });

  describe('find', () => {
    it('returns payload when item found and not expired', async () => {
      mockSend.mockResolvedValue({
        Item: {
          payload: { sub: 'user-id' },
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
      } as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.find('user-id');
      expect(result).toEqual({ sub: 'user-id' });
    });

    it('returns undefined when item not found (backOff rejects)', async () => {
      mockBackOff.mockRejectedValue(new Error('not found') as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.find('missing-id');
      expect(result).toBeUndefined();
    });

    it('returns undefined when item is expired', async () => {
      mockSend.mockResolvedValue({
        Item: {
          payload: { sub: 'user-id' },
          expiresAt: Math.floor(Date.now() / 1000) - 100,
        },
      } as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.find('user-id');
      expect(result).toBeUndefined();
    });

    it('returns payload when no expiresAt (non-expiring item)', async () => {
      mockSend.mockResolvedValue({
        Item: { payload: { sub: 'user-id' } },
      } as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.find('user-id');
      expect(result).toEqual({ sub: 'user-id' });
    });

    it('checks account existence for Session model and returns session when account exists', async () => {
      mockSend
        .mockResolvedValueOnce({
          Item: {
            payload: { accountId: 'some-account', cookie: 'cookie-val' },
          },
        } as never)
        .mockResolvedValueOnce({
          Item: { payload: { sub: 'some-account' } },
        } as never);
      const adapter = new DynamoDBAdapter('Session');
      const result = await adapter.find('session-id');
      expect(result).toEqual({
        accountId: 'some-account',
        cookie: 'cookie-val',
      });
    });

    it('returns undefined for Session when account no longer exists', async () => {
      mockSend.mockResolvedValueOnce({
        Item: {
          payload: { accountId: 'deleted-account', cookie: 'cookie-val' },
        },
      } as never);
      mockBackOff
        .mockImplementationOnce(async (fn: unknown) => (fn as () => unknown)())
        .mockRejectedValueOnce(new Error('not found') as never);
      const adapter = new DynamoDBAdapter('Session');
      const result = await adapter.find('session-id');
      expect(result).toBeUndefined();
    });
  });

  describe('findByUid', () => {
    it('returns payload when found', async () => {
      mockSend.mockResolvedValue({
        Items: [{ payload: { uid: 'user@example.com' } }],
      } as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.findByUid('user@example.com');
      expect(result).toEqual({ uid: 'user@example.com' });
    });

    it('returns undefined when not found', async () => {
      mockBackOff.mockRejectedValue(new Error('not found') as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.findByUid('nobody@example.com');
      expect(result).toBeUndefined();
    });

    it('returns undefined when expired', async () => {
      mockSend.mockResolvedValue({
        Items: [
          {
            payload: { uid: 'user@example.com' },
            expiresAt: Math.floor(Date.now() / 1000) - 10,
          },
        ],
      } as never);
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      const result = await adapter.findByUid('user@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('findByUserCode', () => {
    it('returns payload when found', async () => {
      mockSend.mockResolvedValue({
        Items: [{ payload: { userCode: 'USER-CODE' } }],
      } as never);
      const adapter = new DynamoDBAdapter('DeviceCode');
      const result = await adapter.findByUserCode('USER-CODE');
      expect(result).toEqual({ userCode: 'USER-CODE' });
    });

    it('returns undefined when not found', async () => {
      mockBackOff.mockRejectedValue(new Error('not found') as never);
      const adapter = new DynamoDBAdapter('DeviceCode');
      const result = await adapter.findByUserCode('MISSING');
      expect(result).toBeUndefined();
    });

    it('returns undefined when expired', async () => {
      mockSend.mockResolvedValue({
        Items: [
          {
            payload: { userCode: 'OLD' },
            expiresAt: Math.floor(Date.now() / 1000) - 10,
          },
        ],
      } as never);
      const adapter = new DynamoDBAdapter('DeviceCode');
      const result = await adapter.findByUserCode('OLD');
      expect(result).toBeUndefined();
    });
  });

  describe('consume', () => {
    it('sends UpdateCommand to set consumed timestamp', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.UpdateCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter('AuthorizationCode');
      await adapter.consume('code-id');
      expect(mockSend).toHaveBeenCalled();
      const callArg = (libDynamodb.UpdateCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        UpdateExpression: string;
      };
      expect(callArg.UpdateExpression).toContain('consumed');
    });
  });

  describe('destroy', () => {
    it('sends DeleteCommand with correct modelId key', async () => {
      mockSend.mockResolvedValue(undefined as never);
      (libDynamodb.DeleteCommand as unknown as jest.Mock).mockClear();
      const adapter = new DynamoDBAdapter(Model.BubblyUser);
      await adapter.destroy('user-id');
      expect(mockSend).toHaveBeenCalled();
      const callArg = (libDynamodb.DeleteCommand as unknown as jest.Mock).mock
        .calls[0][0] as {
        Key: { modelId: string };
      };
      expect(callArg.Key.modelId).toBe(`${Model.BubblyUser}-user-id`);
    });
  });

  describe('revokeByGrantId', () => {
    it('deletes items found by grantId', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ modelId: 'Grant-1' }, { modelId: 'Token-2' }],
          LastEvaluatedKey: undefined,
        } as never)
        .mockResolvedValueOnce(undefined as never);
      const adapter = new DynamoDBAdapter('Grant');
      await adapter.revokeByGrantId('grant-abc');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('stops early when no items found', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [],
        LastEvaluatedKey: undefined,
      } as never);
      const adapter = new DynamoDBAdapter('Grant');
      await adapter.revokeByGrantId('empty-grant');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('paginates when LastEvaluatedKey is present', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{ modelId: 'item-1' }],
          LastEvaluatedKey: { modelId: 'item-1' },
        } as never)
        .mockResolvedValueOnce(undefined as never)
        .mockResolvedValueOnce({
          Items: [{ modelId: 'item-2' }],
          LastEvaluatedKey: undefined,
        } as never)
        .mockResolvedValueOnce(undefined as never);
      const adapter = new DynamoDBAdapter('Grant');
      await adapter.revokeByGrantId('paginated-grant');
      expect(mockSend).toHaveBeenCalledTimes(4);
    });
  });
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFind = jest.fn();
const mockFindByUid = jest.fn();
const mockUpsert = jest.fn();
const mockDestroy = jest.fn();

jest.unstable_mockModule('../adapters/dynamodb', () => ({
  DynamoDBAdapter: jest.fn().mockImplementation(() => ({
    find: mockFind,
    findByUid: mockFindByUid,
    upsert: mockUpsert,
    destroy: mockDestroy,
    consume: jest.fn(),
    findByUserCode: jest.fn(),
    revokeByGrantId: jest.fn(),
  })),
}));

jest.unstable_mockModule('nanoid', () => ({
  nanoid: jest.fn().mockReturnValue('generated-id'),
  customAlphabet: jest.fn().mockReturnValue(() => 'mocked'),
}));

const baseProfile = {
  sub: 'bubblyclouds|abc',
  email: 'user@example.com',
  email_verified: true as const,
  name: 'Test User',
};

describe('Account', () => {
  let Account: typeof import('./account').Account;
  let IdentityProvider: typeof import('../types/IdentityProvider').IdentityProvider;

  beforeEach(async () => {
    mockFind.mockReset();
    mockFindByUid.mockReset();
    mockUpsert.mockReset();
    mockDestroy.mockReset();
    ({ Account } = await import('./account'));
    ({ IdentityProvider } = await import('../types/IdentityProvider'));
  });

  describe('claims', () => {
    it('returns profile with accountId as sub when profile is set in constructor', async () => {
      const account = new Account('user-id', baseProfile);
      const claims = await account.claims();
      expect(claims.sub).toBe('user-id');
      expect(claims.email).toBe('user@example.com');
    });

    it('fetches profile from db when not provided in constructor', async () => {
      mockFind.mockResolvedValue({ profile: baseProfile } as never);
      const account = new Account('user-id');
      const claims = await account.claims();
      expect(claims.email).toBe('user@example.com');
      expect(mockFind).toHaveBeenCalledWith('user-id');
    });

    it('throws when user not found in db', async () => {
      mockFind.mockResolvedValue(undefined as never);
      const account = new Account('missing-id');
      await expect(account.claims()).rejects.toThrow();
    });

    it('overrides sub with accountId', async () => {
      const account = new Account('actual-id', {
        ...baseProfile,
        sub: 'other-sub',
      });
      const claims = await account.claims();
      expect(claims.sub).toBe('actual-id');
    });
  });

  describe('federatedTokens', () => {
    it('returns tokens for the given provider', async () => {
      const tokens = { access_token: 'google-token' };
      mockFind.mockResolvedValue({
        federatedTokens: { [IdentityProvider.GOOGLE]: tokens },
      } as never);
      const account = new Account('user-id', baseProfile);
      const result = await account.federatedTokens(IdentityProvider.GOOGLE);
      expect(result).toEqual(tokens);
    });

    it('returns undefined when no federated tokens exist', async () => {
      mockFind.mockResolvedValue({} as never);
      const account = new Account('user-id', baseProfile);
      const result = await account.federatedTokens(IdentityProvider.APPLE);
      expect(result).toBeUndefined();
    });
  });

  describe('destroy', () => {
    it('calls adapter destroy with accountId', async () => {
      mockDestroy.mockResolvedValue(undefined as never);
      const account = new Account('user-id', baseProfile);
      await account.destroy();
      expect(mockDestroy).toHaveBeenCalledWith('user-id');
    });
  });

  describe('findByIDP', () => {
    it('throws when email is missing', async () => {
      await expect(
        Account.findByIDP(
          IdentityProvider.GOOGLE,
          { email_verified: true },
          undefined
        )
      ).rejects.toThrow();
    });

    it('throws when email_verified is false', async () => {
      await expect(
        Account.findByIDP(
          IdentityProvider.GOOGLE,
          { email: 'user@example.com', email_verified: false },
          undefined
        )
      ).rejects.toThrow();
    });

    it('throws when both email and email_verified are missing', async () => {
      await expect(
        Account.findByIDP(IdentityProvider.GOOGLE, {}, undefined)
      ).rejects.toThrow();
    });

    it('creates new user when not found in db', async () => {
      mockFindByUid.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const account = await Account.findByIDP(
        IdentityProvider.GOOGLE,
        {
          email: 'newuser@example.com',
          email_verified: true,
          name: 'New User',
        },
        undefined
      );
      expect(mockUpsert).toHaveBeenCalled();
      expect(account.accountId).toContain('bubblyclouds|');
    });

    it('reuses existing sub when user already exists', async () => {
      mockFindByUid.mockResolvedValue({
        profile: {
          sub: 'existing-sub',
          email: 'user@example.com',
          email_verified: true,
          name: 'Old Name',
        },
      } as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const account = await Account.findByIDP(
        IdentityProvider.GOOGLE,
        { email: 'User@Example.COM', email_verified: true, name: 'New Name' },
        undefined
      );
      expect(account.accountId).toBe('existing-sub');
    });

    it('sanitises email (lowercases)', async () => {
      mockFindByUid.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      await Account.findByIDP(
        IdentityProvider.GOOGLE,
        { email: 'UPPER@EXAMPLE.COM', email_verified: true },
        undefined
      );
      expect(mockFindByUid).toHaveBeenCalledWith('upper@example.com');
    });

    it('stores federated tokens when provided', async () => {
      mockFindByUid.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const tokens = { access_token: 'google-access', id_token: 'google-id' };
      await Account.findByIDP(
        IdentityProvider.GOOGLE,
        { email: 'user@example.com', email_verified: true },
        tokens
      );
      const upsertPayload = (mockUpsert as jest.Mock).mock.calls[0][1] as {
        federatedTokens: Record<string, unknown>;
      };
      expect(upsertPayload.federatedTokens?.[IdentityProvider.GOOGLE]).toEqual(
        tokens
      );
    });

    it('merges existing profile, new values win', async () => {
      mockFindByUid.mockResolvedValue({
        profile: {
          sub: 'existing-sub',
          email: 'user@example.com',
          email_verified: true,
          name: 'Old Name',
          picture: 'http://old.pic',
        },
      } as never);
      mockUpsert.mockResolvedValue(undefined as never);
      await Account.findByIDP(
        IdentityProvider.GOOGLE,
        {
          email: 'user@example.com',
          email_verified: true,
          name: 'New Name',
          picture: 'http://new.pic',
        },
        undefined
      );
      const upsertPayload = (mockUpsert as jest.Mock).mock.calls[0][1] as {
        profile: { name: string; picture: string };
      };
      expect(upsertPayload.profile.name).toBe('New Name');
      expect(upsertPayload.profile.picture).toBe('http://new.pic');
    });

    it('uses email local-part as name when name claim is missing', async () => {
      mockFindByUid.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      await Account.findByIDP(
        IdentityProvider.EMAIL,
        { email: 'testuser@example.com', email_verified: true },
        undefined
      );
      const upsertPayload = (mockUpsert as jest.Mock).mock.calls[0][1] as {
        profile: { name: string };
      };
      expect(upsertPayload.profile.name).toBe('testuser');
    });

    it('stores uid as sanitised email', async () => {
      mockFindByUid.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      await Account.findByIDP(
        IdentityProvider.EMAIL,
        { email: 'Test@Example.COM', email_verified: true },
        undefined
      );
      const upsertPayload = (mockUpsert as jest.Mock).mock.calls[0][1] as {
        uid: string;
      };
      expect(upsertPayload.uid).toBe('test@example.com');
    });
  });

  describe('findAccount', () => {
    it('returns a FindAccount function that creates Account instances', () => {
      const findAccount = Account.findAccount();
      const account = findAccount(
        {} as Parameters<typeof findAccount>[0],
        'some-id',
        undefined
      );
      expect(account).toBeInstanceOf(Account);
      expect((account as InstanceType<typeof Account>).accountId).toBe(
        'some-id'
      );
    });
  });
});

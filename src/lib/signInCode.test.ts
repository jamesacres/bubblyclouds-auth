import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockFind = jest.fn();
const mockUpsert = jest.fn();
const mockConsume = jest.fn();

jest.unstable_mockModule('../adapters/dynamodb', () => ({
  DynamoDBAdapter: jest.fn().mockImplementation(() => ({
    find: mockFind,
    upsert: mockUpsert,
    consume: mockConsume,
    findByUid: jest.fn(),
    findByUserCode: jest.fn(),
    destroy: jest.fn(),
    revokeByGrantId: jest.fn(),
  })),
}));

jest.unstable_mockModule('../utils/random', () => ({
  randomHumanCode: jest.fn().mockReturnValue('ABC-DEF-GHI'),
}));

describe('SignInCode', () => {
  let SignInCode: typeof import('./signInCode').SignInCode;

  beforeEach(async () => {
    mockFind.mockReset();
    mockUpsert.mockReset();
    mockConsume.mockReset();
    ({ SignInCode } = await import('./signInCode'));
  });

  describe('getCode', () => {
    it('returns existing unconsumed code', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'XYZ-111-AAA',
        consumed: undefined,
      } as never);
      const sic = new SignInCode({});
      const code = await sic.getCode('user@example.com');
      expect(code).toBe('XYZ-111-AAA');
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('generates new code when no code exists', async () => {
      mockFind.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      const code = await sic.getCode('user@example.com');
      expect(code).toBe('ABC-DEF-GHI');
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('generates new code when existing code is consumed', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'OLD-111-AAA',
        consumed: 12345,
      } as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      const code = await sic.getCode('user@example.com');
      expect(code).toBe('ABC-DEF-GHI');
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('uses demo account code when email is in demoAccounts', async () => {
      mockFind.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const demoAccounts = {
        'demo@example.com': { signInCode: 'DEMO-CODE-1' },
      };
      const sic = new SignInCode(demoAccounts);
      const code = await sic.getCode('demo@example.com');
      expect(code).toBe('DEMO-CODE-1');
    });

    it('throws for invalid email', async () => {
      const sic = new SignInCode({});
      await expect(sic.getCode('not-an-email')).rejects.toThrow();
    });

    it('upserts with 1-hour TTL', async () => {
      mockFind.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      await sic.getCode('user@example.com');
      expect(mockUpsert).toHaveBeenCalledWith(
        'user@example.com',
        expect.objectContaining({ signInCode: 'ABC-DEF-GHI' }),
        3600
      );
    });

    it('lowercases email before use', async () => {
      mockFind.mockResolvedValue(undefined as never);
      mockUpsert.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      await sic.getCode('User@Example.COM');
      expect(mockUpsert).toHaveBeenCalledWith(
        'user@example.com',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('checkCode', () => {
    it('returns true and consumes code when correct', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'ABC-DEF-GHI',
        consumed: undefined,
      } as never);
      mockConsume.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      const result = await sic.checkCode('user@example.com', 'abc-def-ghi');
      expect(result).toBe(true);
      expect(mockConsume).toHaveBeenCalledWith('user@example.com');
    });

    it('returns true with exact code match', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'ABC-DEF-GHI',
        consumed: undefined,
      } as never);
      mockConsume.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      const result = await sic.checkCode('user@example.com', 'ABC-DEF-GHI');
      expect(result).toBe(true);
    });

    it('returns true ignoring hyphens', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'ABC-DEF-GHI',
        consumed: undefined,
      } as never);
      mockConsume.mockResolvedValue(undefined as never);
      const sic = new SignInCode({});
      const result = await sic.checkCode('user@example.com', 'ABCDEFGHI');
      expect(result).toBe(true);
    });

    it('returns false when code is wrong', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'ABC-DEF-GHI',
        consumed: undefined,
      } as never);
      const sic = new SignInCode({});
      const result = await sic.checkCode('user@example.com', 'ZZZ-ZZZ-ZZZ');
      expect(result).toBe(false);
      expect(mockConsume).not.toHaveBeenCalled();
    });

    it('returns false when requestCode is not a string', async () => {
      mockFind.mockResolvedValue({
        signInCode: 'ABC-DEF-GHI',
        consumed: undefined,
      } as never);
      const sic = new SignInCode({});
      const result = await sic.checkCode(
        'user@example.com',
        123 as unknown as string
      );
      expect(result).toBe(false);
    });
  });
});

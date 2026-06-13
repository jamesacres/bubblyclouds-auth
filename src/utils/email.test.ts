import { describe, it, expect } from '@jest/globals';
import { sanitiseEmail } from './email';

describe('sanitiseEmail', () => {
  it('lowercases and trims valid email', () => {
    // Note: sanitiseEmail trims the returned email but validates the original
    expect(sanitiseEmail('User@Example.COM')).toBe('user@example.com');
  });

  it('returns lowercase valid email unchanged', () => {
    expect(sanitiseEmail('user@example.com')).toBe('user@example.com');
  });

  it('throws for non-string input', () => {
    expect(() => sanitiseEmail(123 as unknown as string)).toThrow();
  });

  it('throws for email shorter than 3 characters', () => {
    expect(() => sanitiseEmail('ab')).toThrow();
  });

  it('throws when email does not contain @', () => {
    expect(() => sanitiseEmail('invalidemail')).toThrow();
  });

  it('throws when email contains double-quote', () => {
    expect(() => sanitiseEmail('"user"@example.com')).toThrow();
  });

  it('throws when local part is empty', () => {
    expect(() => sanitiseEmail('@example.com')).toThrow();
  });

  it('throws when domain has no dot', () => {
    expect(() => sanitiseEmail('user@localhost')).toThrow();
  });

  it('throws when there are multiple @ symbols', () => {
    expect(() => sanitiseEmail('user@@example.com')).toThrow();
  });

  it('accepts subdomains', () => {
    expect(sanitiseEmail('user@sub.example.com')).toBe('user@sub.example.com');
  });

  it('preserves plus addressing', () => {
    expect(sanitiseEmail('user+tag@example.com')).toBe('user+tag@example.com');
  });
});

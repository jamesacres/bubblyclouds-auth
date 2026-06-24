import { describe, it, expect } from '@jest/globals';
import { randomHumanCode } from './random';

describe('randomHumanCode', () => {
  it('returns a string', () => {
    expect(typeof randomHumanCode()).toBe('string');
  });

  it('returns code in XXX-XXX-XXX format', () => {
    expect(randomHumanCode()).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  it('returns uppercase', () => {
    const code = randomHumanCode();
    expect(code).toBe(code.toUpperCase());
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 20 }, () => randomHumanCode()));
    expect(codes.size).toBe(20);
  });

  it('only uses allowed characters (no ambiguous ones like 0,1,i,l,o)', () => {
    for (let i = 0; i < 20; i++) {
      const code = randomHumanCode().replaceAll('-', '');
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{9}$/);
    }
  });

  it('has two hyphens', () => {
    const code = randomHumanCode();
    expect(code.split('-').length).toBe(3);
  });
});

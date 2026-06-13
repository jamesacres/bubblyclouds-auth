import { describe, it, expect } from '@jest/globals';
import {
  signInEmailSubject,
  signInEmailText,
  signInEmailHtml,
} from './signInEmail';

describe('signInEmail view', () => {
  it('signInEmailSubject is correct', () => {
    expect(signInEmailSubject).toBe('Finish signing in to Bubbly Clouds');
  });

  it('signInEmailText includes the code', () => {
    const text = signInEmailText('ABC-DEF-GHI');
    expect(text).toContain('ABC-DEF-GHI');
    expect(text).toContain('Use this code to sign in');
    expect(text).toContain('Not trying to sign in?');
  });

  it('signInEmailText includes footer attribution', () => {
    const text = signInEmailText('TST-000-AAA');
    expect(text).toContain('Bubbly Clouds');
  });

  it('signInEmailText includes verification instruction', () => {
    const text = signInEmailText('ABC-DEF-GHI');
    expect(text).toContain('verify your email address');
  });

  it('signInEmailHtml includes the code', () => {
    const html = signInEmailHtml('XYZ-123-ABC');
    expect(html).toContain('XYZ-123-ABC');
    expect(html).toContain('Use this code to sign in');
  });

  it('signInEmailHtml is valid HTML structure', () => {
    const html = signInEmailHtml('TST-000-AAA');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('signInEmailHtml includes "Not trying to sign in?" message', () => {
    const html = signInEmailHtml('XYZ-999-ZZZ');
    expect(html).toContain('Not trying to sign in?');
  });

  it('signInEmailHtml includes footer thanks', () => {
    const html = signInEmailHtml('AAA-000-BBB');
    expect(html).toContain('Thanks, Bubbly Clouds');
  });
});

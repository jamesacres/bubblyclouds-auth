import { describe, it, expect } from '@jest/globals';
import { login } from './login';

describe('login view', () => {
  it('renders the main login form when no email provided', () => {
    const html = login();
    expect(html).toContain('Sign in with Google');
    expect(html).toContain('Sign in with Apple');
    expect(html).toContain('Sign in with email');
    expect(html).toContain('your@email.com');
  });

  it('renders email code form when email is provided', () => {
    const html = login('user@example.com');
    expect(html).toContain('Enter code sent via email');
    expect(html).toContain('value="user@example.com"');
    expect(html).toContain('emailCode');
    expect(html).not.toContain('Sign in with Google');
  });

  it('renders email code form with hidden email input', () => {
    const html = login('test@domain.com');
    expect(html).toContain('type="hidden"');
    expect(html).toContain('value="test@domain.com"');
  });

  it('includes cancel and terms links', () => {
    const html = login();
    expect(html).toContain('/abort');
    expect(html).toContain('Terms of Service');
    expect(html).toContain('Privacy Policy');
  });

  it('includes links to google and apple federated login when no email', () => {
    const html = login();
    expect(html).toContain('/federated/google');
    expect(html).toContain('/federated/apple');
  });

  it('includes a "Not received? Try a different method" link when email provided', () => {
    const html = login('user@example.com');
    expect(html).toContain('Not received? Try a different method');
    expect(html).not.toContain('Sign in with Apple');
  });

  it('is a valid HTML document', () => {
    const html = login();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });
});

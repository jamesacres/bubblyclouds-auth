import { describe, it, expect } from '@jest/globals';
import { consent } from './consent';

describe('consent view', () => {
  it('returns HTML string with continue form', () => {
    const html = consent();
    expect(html).toContain('Press continue to return to the app');
    expect(html).toContain('/confirm');
    expect(html).toContain('Continue');
  });

  it('includes switch user and cancel links', () => {
    const html = consent();
    expect(html).toContain('Switch User');
    expect(html).toContain('/abort');
  });

  it('includes terms and privacy links', () => {
    const html = consent();
    expect(html).toContain('Terms of Service');
    expect(html).toContain('Privacy Policy');
  });

  it('is a valid HTML document', () => {
    const html = consent();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });

  it('has a POST form for confirmation', () => {
    const html = consent();
    expect(html).toContain('method="post"');
    expect(html).toContain('type="submit"');
  });
});

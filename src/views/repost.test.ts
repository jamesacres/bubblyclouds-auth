import { describe, it, expect } from '@jest/globals';
import { repost } from './repost';

describe('repost view', () => {
  it('renders without postBody', () => {
    const html = repost();
    expect(html).toContain('/oidc/interaction/');
    expect(html).toContain('undefined');
  });

  it('renders with postBody', () => {
    const html = repost({ state: 'abc123', code: 'auth-code' });
    expect(html).toContain('"state":"abc123"');
    expect(html).toContain('"code":"auth-code"');
  });

  it('includes form submission script', () => {
    const html = repost();
    expect(html).toContain('form.submit()');
    expect(html).toContain("form.method = 'POST'");
  });

  it('sets form action to federated endpoint', () => {
    const html = repost({ state: 'mystate', code: 'mycode' });
    expect(html).toContain('/federated');
  });

  it('serialises postBody as JSON', () => {
    const html = repost({ state: 'st', code: 'cd' });
    expect(html).toContain(JSON.stringify({ state: 'st', code: 'cd' }));
  });
});

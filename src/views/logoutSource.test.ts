import { describe, it, expect } from '@jest/globals';
import { KoaContextWithOIDC } from 'oidc-provider';
import { logoutSource } from './logoutSource';

describe('logoutSource view', () => {
  it('sets ctx.body with logout HTML containing the form', () => {
    const ctx = {
      body: '',
      request: { header: {} },
    } as unknown as KoaContextWithOIDC;
    logoutSource(ctx, '<form id="op.logoutForm"></form>');
    expect(ctx.body).toContain('<form id="op.logoutForm"></form>');
    expect(ctx.body).toContain('Do you want to sign-out?');
    expect(ctx.body).toContain('Yes, sign me out');
  });

  it('sets ctx.body with "No, stay signed in" option', () => {
    const ctx = {
      body: '',
      request: { header: {} },
    } as unknown as KoaContextWithOIDC;
    logoutSource(ctx, '<form id="op.logoutForm"></form>');
    expect(ctx.body).toContain('No, stay signed in');
  });

  it('embeds the provided form HTML verbatim', () => {
    const ctx = {
      body: '',
      request: { header: {} },
    } as unknown as KoaContextWithOIDC;
    const customForm =
      '<form id="op.logoutForm" action="/logout"><input type="hidden" name="xsrf" value="abc"></form>';
    logoutSource(ctx, customForm);
    expect(ctx.body).toContain(customForm);
  });

  it('produces a valid HTML document', () => {
    const ctx = {
      body: '',
      request: { header: {} },
    } as unknown as KoaContextWithOIDC;
    logoutSource(ctx, '<form id="op.logoutForm"></form>');
    expect(ctx.body).toContain('<!DOCTYPE html>');
    expect(ctx.body).toContain('<html lang="en" dir="ltr">');
    expect(ctx.body).toContain('</html>');
  });

  it('submit button targets op.logoutForm', () => {
    const ctx = {
      body: '',
      request: { header: {} },
    } as unknown as KoaContextWithOIDC;
    logoutSource(ctx, '<form id="op.logoutForm"></form>');
    expect(ctx.body).toContain('form="op.logoutForm"');
  });
});

describe('logoutSource localisation', () => {
  it('uses the Accept-Language header', () => {
    const ctx = {
      body: '',
      request: { header: { 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' } },
    } as unknown as KoaContextWithOIDC;
    logoutSource(ctx, '<form id="op.logoutForm"></form>');
    expect(ctx.body).toContain('<html lang="de" dir="ltr">');
    expect(ctx.body).toContain('Möchten Sie sich abmelden?');
  });
});

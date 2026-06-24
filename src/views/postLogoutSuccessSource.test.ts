import { describe, it, expect, jest } from '@jest/globals';
import { KoaContextWithOIDC } from 'oidc-provider';
import { postLogoutSuccessSource } from './postLogoutSuccessSource';

describe('postLogoutSuccessSource view', () => {
  it('redirects to bubblyclouds.com', () => {
    const redirectMock = jest.fn();
    const ctx = { redirect: redirectMock } as unknown as KoaContextWithOIDC;
    postLogoutSuccessSource(ctx);
    expect(redirectMock).toHaveBeenCalledWith('https://bubblyclouds.com');
  });

  it('calls redirect exactly once', () => {
    const redirectMock = jest.fn();
    const ctx = { redirect: redirectMock } as unknown as KoaContextWithOIDC;
    postLogoutSuccessSource(ctx);
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });
});

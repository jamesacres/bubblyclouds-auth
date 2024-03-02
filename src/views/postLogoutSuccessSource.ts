import { KoaContextWithOIDC } from 'oidc-provider';

export const postLogoutSuccessSource = (ctx: KoaContextWithOIDC) => {
  ctx.redirect('https://bubblyclouds.com');
};

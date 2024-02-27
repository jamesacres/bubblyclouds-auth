import { KoaContextWithOIDC } from 'oidc-provider';

export const postLogoutSuccessSource = (ctx: KoaContextWithOIDC) => {
  ctx.body = `<!DOCTYPE html>
    <html>
    <head>
      <title>Sign-out Success</title>
    </head>
    <body>
      <div>
        <h1>Sign-out Success</h1>
        <p>Your sign-out was successful.</p>
      </div>
    </body>
    </html>`;
};

import { KoaContextWithOIDC } from 'oidc-provider';

export const logoutSource = (ctx: KoaContextWithOIDC, form: string) => {
  ctx.body = `<!DOCTYPE html>
    <html>
    <head>
      <title>Logout Request</title>
    </head>
    <body>
      <div>
        <h1>Do you want to sign-out?</h1>
        ${form}
        <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Yes, sign me out</button>
        <button type="submit" form="op.logoutForm">No, stay signed in</button>
      </div>
    </body>
    </html>`;
};

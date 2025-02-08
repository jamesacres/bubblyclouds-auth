import { KoaContextWithOIDC } from 'oidc-provider';

export const logoutSource = (ctx: KoaContextWithOIDC, form: string) => {
  ctx.body = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
      <meta http-equiv="x-ua-compatible" content="ie=edge">
      <title>Bubbly Clouds Sign out</title>
      <style>
        @import url(https://fonts.googleapis.com/css?family=Roboto:400,100);
  
        body {
          font-family: 'Roboto', sans-serif;
          margin: 0;
          background-color: rgb(0, 0, 0);
          color: rgb(0, 0, 0);
          text-align: center;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          flex-direction: column;
        }

        .logo {
          width: 274px;
          margin: 20px;
        }
  
        .login-card {
          padding: 40px;
          padding-top: 0px;
          padding-bottom: 10px;
          width: 274px;
          background-color: #F7F7F7;
          margin: 0 auto 10px;
          border-radius: 2px;
          box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }
  
        .login-card h1 {
          font-weight: 100;
          text-align: center;
          font-size: 2.3em;
        }

        .login-card a {
          text-decoration: none;
          font-weight: 400;
          text-align: center;
          display: inline-block;
          color: rgb(17, 24, 39);
          padding-top: 5px;
        }
      </style>
    </head>
    <body>
    <img src="https://bubblyclouds.com/bubbly-clouds.png" class="logo">
      <div class="login-card">
        <h1>Do you want to sign-out?</h1>
        ${form}
        <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Yes, sign me out</button>
        <button type="submit" form="op.logoutForm">No, stay signed in</button>
        </div>
      </div>
    </body>
  </html>`;
};

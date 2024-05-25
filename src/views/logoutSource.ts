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
          margin-top: 25px;
          margin-bottom: 25px;
          background-color: rgb(17, 24, 39);
          color: rgb(17, 24, 39);
          text-align: center;
        }

        .logo {
          width: 100%;
          margin-top: 20px;
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

        .login {
          text-align: center;
          font-size: 14px;
          font-family: 'Arial', sans-serif;
          font-weight: 700;
          height: 36px;
          padding: 0 8px;
        }
  
        .login-submit {
          border: 0px;
          color: #fff;
          text-shadow: 0 1px rgba(0,0,0,0.1);
          background-color: #4d90fe;
        }
  
        .google-button {
          display: block;
          width: 100%;
          height: 40px;
          border-width: 0;
          background: white;
          color: #737373;
          border-radius: 5px;
          white-space: nowrap;
          box-shadow: 1px 1px 0px 1px rgba(0,0,0,0.05);
          transition-property: background-color, box-shadow;
          transition-duration: 150ms;
          transition-timing-function: ease-in-out;
          padding: 0;
  
          &:focus,
          &:hover {
            box-shadow: 1px 4px 5px 1px rgba(0,0,0,0.1);
          }
  
          &:active {
            background-color: #e5e5e5;
            box-shadow: none;
            transition-duration: 10ms;
          }
        }
  
        .google-button__icon {
          display: inline-block;
          vertical-align: middle;
          margin: 8px 0 8px 8px;
          width: 18px;
          height: 18px;
          box-sizing: border-box;
        }
  
        .google-button__icon--plus {
          width: 27px;
        }
  
        .google-button__text {
          display: inline-block;
          vertical-align: middle;
          padding: 0 24px;
          font-size: 14px;
          font-weight: bold;
          font-family: 'Roboto',arial,sans-serif;
        }
  
        .login-card a {
          text-decoration: none;
          font-weight: 400;
          text-align: center;
          display: inline-block;
          color: rgb(17, 24, 39);
          padding-top: 5px;
        }
  
        .login-help {
          width: 100%;
          text-align: center;
          font-size: 12px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="login-card">
        <img src="https://bubblyclouds.com/bubbly-clouds-invert.png" class="logo">
        <h1>Do you want to sign-out?</h1>
        ${form}
        <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Yes, sign me out</button>
        <button type="submit" form="op.logoutForm">No, stay signed in</button>
        </div>
      </div>
    </body>
  </html>`;
};

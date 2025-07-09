export const consent = () => `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
      <meta http-equiv="x-ua-compatible" content="ie=edge">
      <title>Bubbly Clouds Sign in</title>
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
  
        .google-button, .apple-button {
          display: block;
          width: 100%;
          height: 40px;
          color: #737373;
          white-space: nowrap;
          padding: 0;
          border-radius: 5px;
        }

        .apple-button {
          background: #000000;
          border: 1px solid #000000;
        }

        .google-button {
          background: white;
          box-shadow: 1px 1px 0px 1px rgba(0,0,0,0.05);
          transition-property: background-color, box-shadow;
          transition-duration: 150ms;
          transition-timing-function: ease-in-out;

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
  
        .login-card a {
          text-decoration: none;
          font-weight: 400;
          text-align: center;
          display: inline-block;
          color: rgb(17, 24, 39);
        }
  
        .login-help {
          width: 100%;
          text-align: center;
          font-size: 12px;
          margin-top: 20px;
        }

        .continue-form {
        }

        .continue-button {
          padding: 8px;
          color: #ffffff;
          background-color: #000000;
          border: 1px solid #000000;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <img src="https://bubblyclouds.com/bubbly-clouds.png" class="logo">
      <div class="login-card">
        <h1><%= client.clientName %></h1>
        <p>Press continue to return to the app.</p>
        <form method="post" class="continue-form" action="/oidc/interaction/<%= uid %>/confirm">
          <button class="continue-button" type="submit">Continue</button>
        </form>
        <div class="login-help">
          <a href="/oidc/interaction/<%= uid %>/abort">Cancel</a> | 
          <a href="https://bubblyclouds.com/terms" target="_blank">Terms of Service</a> | 
          <a href="https://bubblyclouds.com/privacy" target="_blank">Privacy Policy</a>
        </div>
      </div>
    </body>
  </html>`;

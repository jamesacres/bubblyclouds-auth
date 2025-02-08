export const login = `<!DOCTYPE html>
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
          padding-top: 0px;
          background: #000000;
          border: 1px solid #000000;
        }

        .google-button {
          padding-top: 5px;
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

        .google-button__icon, .apple-button__icon {
          display: inline-block;
          vertical-align: middle;
          margin: 8px 0 8px 8px;
          width: 18px;
          height: 18px;
          box-sizing: border-box;
        }

        .apple-button__icon {
          margin: 0px;
          width: 39px;
          height: 40px;
        }

        .google-button__text, .apple-button__text {
          display: inline-block;
          vertical-align: middle;
          padding: 0 24px;
          font-size: 16px;
          font-weight: bold;
          font-family: 'Roboto',arial,sans-serif;
        }

        .apple-button__text {
          font-family: system-ui;
          color: #ffffff;
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
      </style>
    </head>
    <body>
      <img src="https://bubblyclouds.com/bubbly-clouds.png" class="logo">
      <div class="login-card">
        <h1><%= client.clientName %></h1>
        <a href="/oidc/interaction/<%= uid %>/federated/google" class="google-button">
          <span class="google-button__icon">
            <svg viewBox="0 0 366 372" xmlns="http://www.w3.org/2000/svg"><path d="M125.9 10.2c40.2-13.9 85.3-13.6 125.3 1.1 22.2 8.2 42.5 21 59.9 37.1-5.8 6.3-12.1 12.2-18.1 18.3l-34.2 34.2c-11.3-10.8-25.1-19-40.1-23.6-17.6-5.3-36.6-6.1-54.6-2.2-21 4.5-40.5 15.5-55.6 30.9-12.2 12.3-21.4 27.5-27 43.9-20.3-15.8-40.6-31.5-61-47.3 21.5-43 60.1-76.9 105.4-92.4z" id="Shape" fill="#EA4335"/><path d="M20.6 102.4c20.3 15.8 40.6 31.5 61 47.3-8 23.3-8 49.2 0 72.4-20.3 15.8-40.6 31.6-60.9 47.3C1.9 232.7-3.8 189.6 4.4 149.2c3.3-16.2 8.7-32 16.2-46.8z" id="Shape" fill="#FBBC05"/><path d="M361.7 151.1c5.8 32.7 4.5 66.8-4.7 98.8-8.5 29.3-24.6 56.5-47.1 77.2l-59.1-45.9c19.5-13.1 33.3-34.3 37.2-57.5H186.6c.1-24.2.1-48.4.1-72.6h175z" id="Shape" fill="#4285F4"/><path d="M81.4 222.2c7.8 22.9 22.8 43.2 42.6 57.1 12.4 8.7 26.6 14.9 41.4 17.9 14.6 3 29.7 2.6 44.4.1 14.6-2.6 28.7-7.9 41-16.2l59.1 45.9c-21.3 19.7-48 33.1-76.2 39.6-31.2 7.1-64.2 7.3-95.2-1-24.6-6.5-47.7-18.2-67.6-34.1-20.9-16.6-38.3-38-50.4-62 20.3-15.7 40.6-31.5 60.9-47.3z" fill="#34A853"/></svg>
          </span>
          <span class="google-button__text">Sign in with Google</span>
        </a>
        <a href="/oidc/interaction/<%= uid %>/federated/apple" class="apple-button" style="margin-top: 8px;">
          <span class="apple-button__icon">
            <svg viewBox="0 0 39 40" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                <!-- Generator: Sketch 61 (89581) - https://sketch.com -->
                <title>Left White Logo Large</title>
                <desc>Created with Sketch.</desc>
                <g id="Left-White-Logo-Large" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                    <rect id="Rectangle" fill="#000000" x="0" y="0" width="39" height="44"></rect>
                    <path d="M19.8196726,13.1384615 C20.902953,13.1384615 22.2608678,12.406103 23.0695137,11.4296249 C23.8018722,10.5446917 24.3358837,9.30883662 24.3358837,8.07298156 C24.3358837,7.9051494 24.3206262,7.73731723 24.2901113,7.6 C23.0847711,7.64577241 21.6353115,8.4086459 20.7656357,9.43089638 C20.0790496,10.2090273 19.4534933,11.4296249 19.4534933,12.6807374 C19.4534933,12.8638271 19.4840083,13.0469167 19.4992657,13.1079466 C19.5755531,13.1232041 19.6976128,13.1384615 19.8196726,13.1384615 Z M16.0053051,31.6 C17.4852797,31.6 18.1413509,30.6082645 19.9875048,30.6082645 C21.8641736,30.6082645 22.2761252,31.5694851 23.923932,31.5694851 C25.5412238,31.5694851 26.6245041,30.074253 27.6467546,28.6095359 C28.7910648,26.9312142 29.2640464,25.2834075 29.2945613,25.2071202 C29.1877591,25.1766052 26.0904927,23.9102352 26.0904927,20.3552448 C26.0904927,17.2732359 28.5316879,15.8848061 28.6690051,15.7780038 C27.0517133,13.4588684 24.5952606,13.3978385 23.923932,13.3978385 C22.1082931,13.3978385 20.6283185,14.4963764 19.6976128,14.4963764 C18.6906198,14.4963764 17.36322,13.4588684 15.7917006,13.4588684 C12.8012365,13.4588684 9.765,15.9305785 9.765,20.5993643 C9.765,23.4982835 10.8940528,26.565035 12.2824825,28.548506 C13.4725652,30.2268277 14.5100731,31.6 16.0053051,31.6 Z" id="" fill="#FFFFFF" fill-rule="nonzero"></path>
                </g>
            </svg>
          </span>
          <span class="apple-button__text">Sign in with Apple</span>
        </a>
        <div class="login-help">
          <a href="/oidc/interaction/<%= uid %>/abort">Cancel</a> | 
          <a href="https://bubblyclouds.com/terms" target="_blank">Terms of Service</a> | 
          <a href="https://bubblyclouds.com/privacy" target="_blank">Privacy Policy</a>
        </div>
      </div>
    </body>
  </html>`;

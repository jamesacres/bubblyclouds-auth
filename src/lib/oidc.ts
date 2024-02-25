import helmet from 'koa-helmet';
import Provider, { Configuration, JWK } from 'oidc-provider';

export interface OidcOptions {
  keys: JWK[];
}

const initProvider = ({ keys }: OidcOptions) => {
  const configuration: Configuration = {
    clients: [
      {
        client_id: 'foo',
        client_secret: 'bar',
        redirect_uris: ['http://lvh.me:8080/cb'],
      },
    ],
    jwks: { keys },
  };

  const provider = new Provider('http://localhost:3000', configuration);

  provider.use(helmet());

  provider.use(async (ctx, next) => {
    console.log('pre middleware', ctx.method, ctx.path);

    await next();

    if (ctx.oidc?.route) {
      console.log('post middleware', ctx.method, ctx.oidc.route);
    }
  });

  return provider;
};

export { initProvider };

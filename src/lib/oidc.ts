import Provider, { Configuration } from 'oidc-provider';

const initProvider = () => {
  const configuration: Configuration = {
    clients: [
      {
        client_id: 'foo',
        client_secret: 'bar',
        redirect_uris: ['http://lvh.me:8080/cb'],
      },
    ],
  };

  const provider = new Provider('http://localhost:3000', configuration);

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

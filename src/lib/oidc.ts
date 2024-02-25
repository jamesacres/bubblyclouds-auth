import helmet from 'koa-helmet';
import Provider, {
  Configuration,
  JWK,
  KoaContextWithOIDC,
  errors,
} from 'oidc-provider';
import { oidcInteraction } from '../routes/oidcInteraction';
import { Account } from '../models/account';
import { constants } from 'http2';
import { DynamoDBAdapter } from '../adapters/dynamodb';

export interface OidcOptions {
  keys: JWK[];
}

const initProvider = ({ keys }: OidcOptions) => {
  console.info('initProvider');
  const configuration: Configuration = {
    adapter: DynamoDBAdapter,
    clients: [
      {
        access_token_ttl: 28800,
        application_type: 'web',
        client_id: 'bubbly-sudoku',
        client_name: 'Bubbly Sudoku',
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: ['http://localhost:3000/cb'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
    ],
    jwks: { keys },
    features: {
      devInteractions: { enabled: false },
    },
    findAccount: Account.findAccount(),
    interactions: {
      url(_ctx, interaction) {
        return `/oidc/interaction/${interaction.uid}`;
      },
    },
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

  provider.on(
    'server_error',
    (ctx: KoaContextWithOIDC, err: errors.OIDCProviderError) => {
      if (err?.status < constants.HTTP_STATUS_INTERNAL_SERVER_ERROR) {
        console.warn(err);
      } else {
        console.error(err);
      }
      console.trace(err);
    }
  );

  provider.use(oidcInteraction(provider).routes());

  return provider;
};

export { initProvider };

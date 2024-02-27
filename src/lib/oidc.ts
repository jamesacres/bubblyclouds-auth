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
import { randomBytes } from 'crypto';

export interface OidcOptions {
  issuer: string;
  keys: JWK[];
}

const initProvider = ({ keys, issuer }: OidcOptions) => {
  console.info('initProvider');
  const configuration: Configuration = {
    adapter: DynamoDBAdapter,
    clients: [
      {
        // TODO configure JWT response
        // TODO configure resource indicators
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
    ttl: {
      AccessToken: function AccessTokenTTL(ctx, token) {
        return token.resourceServer?.accessTokenTTL || 60 * 60 * 12; // 12 hours in seconds
      },
      AuthorizationCode: 60 /* 1 minute in seconds */,
      BackchannelAuthenticationRequest:
        function BackchannelAuthenticationRequestTTL(ctx) {
          if (ctx?.oidc && ctx.oidc.params?.requested_expiry) {
            return Math.min(10 * 60, +ctx.oidc.params.requested_expiry); // 10 minutes in seconds or requested_expiry, whichever is shorter
          }

          return 10 * 60; // 10 minutes in seconds
        },
      ClientCredentials: function ClientCredentialsTTL(ctx, token) {
        return token.resourceServer?.accessTokenTTL || 10 * 60; // 10 minutes in seconds
      },
      DeviceCode: 600 /* 10 minutes in seconds */,
      Grant: 31536000 /* 1 year in seconds - must be higher than max refresh token time */,
      IdToken: 3600 /* 1 hour in seconds */,
      Interaction: 3600 /* 1 hour in seconds */,
      RefreshToken: function RefreshTokenTTL(ctx, token, client) {
        if (
          ctx &&
          ctx.oidc.entities.RotatedRefreshToken &&
          client.applicationType === 'web' &&
          client.clientAuthMethod === 'none' &&
          !token.isSenderConstrained()
        ) {
          // Non-Sender Constrained SPA RefreshTokens do not have infinite expiration through rotation
          return ctx.oidc.entities.RotatedRefreshToken.remainingTTL;
        }

        return 14 * 24 * 60 * 60; // 14 days in seconds
      },
      Session: 1209600 /* 14 days in seconds */,
    },
    loadExistingGrant: async (ctx) => {
      const grantId =
        ctx.oidc.result?.consent?.grantId ||
        (ctx.oidc.client &&
          ctx.oidc.session?.grantIdFor(ctx.oidc.client?.clientId));
      if (grantId) {
        return ctx.oidc.provider.Grant.find(grantId);
      }

      // We always want to skip consent screen
      if (ctx.oidc.client && ctx.oidc.session) {
        console.info('Skipping consent');
        const grant = new ctx.oidc.provider.Grant({
          clientId: ctx.oidc.client.clientId,
          accountId: ctx.oidc.session.accountId,
        });
        grant.addOIDCScope(Array.from(ctx.oidc.requestParamScopes).join(' '));
        grant.addOIDCClaims(Array.from(ctx.oidc.requestParamClaims));
        grant.addResourceScope(
          'urn:example:resource-indicator',
          'api:read api:write'
        );
        await grant.save();
        return grant;
      }

      return undefined;
    },
  };

  const provider = new Provider(issuer, configuration);

  provider.use(async (ctx, next) => {
    ctx.state.cspNonce = randomBytes(32).toString('hex');
    return helmet.contentSecurityPolicy({
      directives: {
        scriptSrc: ["'self'", `'nonce-${ctx.state.cspNonce}'`],
      },
    })(ctx, next);
  });

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

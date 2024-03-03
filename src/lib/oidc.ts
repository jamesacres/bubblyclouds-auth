import helmet from 'helmet';
import Provider, {
  Configuration,
  KoaContextWithOIDC,
  ResourceServer,
  errors,
} from 'oidc-provider';
import { oidcInteraction } from '../routes/oidcInteraction';
import { Account } from '../models/account';
import { constants } from 'http2';
import { DynamoDBAdapter } from '../adapters/dynamodb';
import { randomBytes } from 'crypto';
import { logoutSource } from '../views/logoutSource';
import { postLogoutSuccessSource } from '../views/postLogoutSuccessSource';
import { promisify } from 'util';
import { OidcOptions } from '../types/OidcOptions';

const defaultResource: ResourceServer = {
  scope: 'openid',
  accessTokenFormat: 'jwt',
};

const initProvider = ({
  appConfig: { clients, cookies, serverUrl, federatedClients, resources },
  keys,
  issuer,
}: OidcOptions) => {
  console.info('initProvider');
  const configuration: Configuration = {
    clients,
    cookies: {
      keys: cookies.secretKeys,
      long: {
        httpOnly: true,
        overwrite: true,
        sameSite: 'none',
        signed: true,
      },
      short: {
        httpOnly: true,
        overwrite: true,
        sameSite: 'lax',
        signed: true,
      },
    },
    adapter: DynamoDBAdapter,
    jwks: { keys },
    scopes: ['openid', 'offline_access'],
    claims: {
      // requesting a scope will return the mapped claims
      address: ['address'],
      email: ['email', 'email_verified'],
      phone: ['phone_number', 'phone_number_verified'],
      profile: [
        'birthdate',
        'family_name',
        'gender',
        'given_name',
        'locale',
        'middle_name',
        'name',
        'nickname',
        'picture',
        'preferred_username',
        'profile',
        'updated_at',
        'website',
        'zoneinfo',
      ],
    },
    features: {
      devInteractions: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: (ctx, client) => {
          const clientId = client?.clientId;
          if (clientId) {
            // When no or multiple resources provided, default to the client
            console.info('defaultResource', clientId);
            return `https://${clientId}`;
          }
          console.info('no defaultResource');
          return undefined as unknown as string;
        },
        getResourceServerInfo(ctx, resourceIndicator, client) {
          const clientId = client.clientId;
          if (clientId) {
            if (resourceIndicator === `https://${clientId}`) {
              // Default client audience
              console.info('getResourceServerInfo default client', clientId);
              return {
                ...defaultResource,
                audience: clientId,
              };
            }

            const isAllowed =
              resources[resourceIndicator] &&
              resources[resourceIndicator].allowedClientIds.includes(clientId);
            if (isAllowed) {
              // Specific resource audience
              console.info(
                'getResourceServerInfo specific resource',
                clientId,
                resourceIndicator
              );
              return {
                ...defaultResource,
                audience: resourceIndicator,
                ...resources[resourceIndicator]?.config,
              };
            }
          }
          throw new errors.InvalidTarget();
        },
        useGrantedResource: () => {
          // recommendation: Use return true when it's allowed for a client skip providing the "resource" parameter at the Token Endpoint.
          return true;
        },
      },
      rpInitiatedLogout: {
        logoutSource,
        postLogoutSuccessSource,
        enabled: true,
      },
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
      AuthorizationCode: 60 * 5 /* 5 minutes in seconds */,
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
          // This means when rotated the new refresh token expires on the same day as previous rather than extending
          // Because the client has no secret and is public
          return ctx.oidc.entities.RotatedRefreshToken.remainingTTL;
        }

        return 14 * 24 * 60 * 60; // 14 days in seconds, after which the user will need to redirect via the login flow again
      },
      Session: 1 * 24 * 60 * 60, // 1 day in seconds, we also set remember: false so it ends with browser session, we don't mind user reauthentication as we redirect to third party to refresh their profile anyway
    },
    expiresWithSession: () => {
      // return !code.scopes.has('offline_access');
      // We don't want web tokens to expire when their cookie session does, so this is disabled
      return false;
    },
    loadExistingGrant: async (ctx) => {
      const grantId =
        ctx.oidc.result?.consent?.grantId ||
        (ctx.oidc.client &&
          ctx.oidc.session?.grantIdFor(ctx.oidc.client?.clientId));
      if (grantId) {
        console.info('Existing grant');
        // return ctx.oidc.provider.Grant.find(grantId);
        // We won't load the existing grant
        // We want a new grant each time
        console.warn('Ignoring existing grant');
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

        // Requested resource or default
        const resource = ctx.oidc.params?.resource
          ? <string>ctx.oidc.params?.resource
          : `https://${ctx.oidc.client.clientId}`;
        const scope = resources[resource]?.config?.scope || 'openid';
        grant.addResourceScope(resource, scope);
        await grant.save();
        return grant;
      }

      return undefined;
    },
    issueRefreshToken: (ctx, client, code) => {
      if (!client.grantTypeAllowed('refresh_token')) {
        return false;
      }
      return (
        code.scopes.has('offline_access') ||
        // We always want to return refresh_token to web clients
        // This is required so we don't need prompt=consent and a consent view implemented
        (client.applicationType === 'web' && client.clientAuthMethod === 'none')
      );
    },
  };

  const provider = new Provider(issuer, configuration);

  provider.use(async (ctx, next) => {
    ctx.state.cspNonce = randomBytes(32).toString('hex');

    const directives = helmet.contentSecurityPolicy.getDefaultDirectives();
    delete directives['form-action']; // (because we redirect to clients after POST)
    delete directives['script-src']; // (nonce configured below)
    delete directives['img-src']; // (configured below)

    const pHelmet = promisify(
      helmet({
        contentSecurityPolicy: {
          useDefaults: false,
          directives: {
            ...directives,
            scriptSrc: ["'self'", `'nonce-${ctx.state.cspNonce}'`],
            imgSrc: ["'self'", 'https://bubblyclouds.com'],
          },
        },
      })
    );

    await pHelmet(ctx.req, ctx.res);

    return next();
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

  provider.use(oidcInteraction(provider, serverUrl, federatedClients).routes());

  return provider;
};

export { initProvider };

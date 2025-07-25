import helmet from 'helmet';
import Provider, {
  Configuration,
  KoaContextWithOIDC,
  ResourceServer,
  errors,
  interactionPolicy,
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
import { FederatedClients } from './federatedClients';
import { api } from '../routes/api';
import { importJWK, JWK, jwtVerify } from 'jose';

const defaultResource: ResourceServer = {
  scope: 'openid',
  accessTokenFormat: 'jwt',
};

// https://github.com/panva/node-oidc-provider/blob/main/recipes/client_based_origins.md
const corsProp = 'urn:custom:client:allowed-cors-origins';

const initProvider = ({
  appConfig: {
    clients,
    cookies,
    serverUrl,
    serverUrlProd,
    resources,
    federatedClients: federatedClientsConfig,
  },
  keys,
  issuer,
  ses,
  signInCode,
}: OidcOptions) => {
  console.info('initProvider');
  const configuration: Configuration = {
    clients,
    extraClientMetadata: {
      properties: [corsProp],
      validator(ctx, key, value, metadata) {
        if (key === corsProp) {
          // set default (no CORS)
          if (value === undefined) {
            metadata[corsProp] = [];
            return;
          }
          // validate an array of Origin strings
          if (!Array.isArray(value)) {
            throw new errors.InvalidClientMetadata(
              `${corsProp} must be an array of origins`
            );
          }
        }
      },
    },
    clientBasedCORS(ctx, origin, client) {
      // ctx.oidc.route can be used to exclude endpoints from this behaviour, in that case just return
      // true to always allow CORS on them, false to deny
      // you may also allow some known internal origins if you want to
      return (client[corsProp] as string[]).includes(origin);
    },
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
      policy: (() => {
        const policy = interactionPolicy.base();

        // Chrome does not redirect without user interaction so we will require this again
        // const consentPolicy = policy.get('consent');
        // if (consentPolicy) {
        //   // Skip forcing native clients to interact, also see loadExistingGrant for skipping consent
        //   const nativePrompt = consentPolicy.checks.get('native_client_prompt');
        //   if (nativePrompt) {
        //     nativePrompt.check = () => {
        //       console.warn('Skipping native_client_prompt');
        //       return false;
        //     };
        //   }
        // }

        return policy;
      })(),
      url(_ctx, interaction) {
        return `/oidc/interaction/${interaction.uid}`;
      },
    },
    ttl: {
      AccessToken: function AccessTokenTTL(ctx, token) {
        return token.resourceServer?.accessTokenTTL || 60 * 60 * 2; // 2 hours in seconds
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
      Session: 30 * 24 * 60 * 60, // 30 days in seconds, we also set remember: true so it doesn't end with browser session to reduce need to re-prompt
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
        if (ctx.oidc.client?.applicationType === 'native') {
          console.info('Returning existing native grant');
          return ctx.oidc.provider.Grant.find(grantId);
        }
        // We won't load the existing grant
        // We want a new grant each time
        console.warn('Ignoring existing grant');
      }

      // We always want to skip consent screen
      // Unless native
      if (
        ctx.oidc.client &&
        ctx.oidc.session &&
        ctx.oidc.client.applicationType !== 'native'
      ) {
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
        const scope =
          resources[resource]?.clientIdScope?.[ctx.oidc.client.clientId] ||
          'openid';
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
        // We always want to return refresh_token to web/native clients
        // This is required so we don't need prompt=consent and a consent view implemented
        (!!client.applicationType &&
          ['web', 'native'].includes(client.applicationType) &&
          client.clientAuthMethod === 'none')
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

  const federatedClients = new FederatedClients({
    serverUrl,
    serverUrlProd,
    federatedClients: federatedClientsConfig,
  });
  provider.use(
    oidcInteraction(provider, ses, signInCode, federatedClients).routes()
  );

  const verifyToken = async (
    token: string | undefined,
    accountId: string
  ): Promise<boolean> => {
    if (token && accountId) {
      const publicKey = await importJWK(
        keys.find((key) => key.kty === 'RSA' && key.use === 'sig')! as JWK,
        'RS256'
      );
      const result = await jwtVerify(token, publicKey, { issuer }).catch(
        (e) => {
          console.warn(e);
          return undefined;
        }
      );
      if (result?.payload?.sub === accountId) {
        console.info('accountId matches sub', result?.payload?.sub, accountId);
        return true;
      } else {
        console.warn(
          'accountId does not match sub',
          result?.payload?.sub,
          accountId
        );
      }
    } else {
      console.warn('missing token or accountId');
    }
    return false;
  };
  provider.use(api(verifyToken, federatedClients).routes());

  return provider;
};

export { initProvider };

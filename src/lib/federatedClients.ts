import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import {
  Configuration,
  IDToken,
  implicitAuthentication,
  authorizationCodeGrant,
} from 'openid-client';
import { AppConfig } from '../types/AppConfig';
import { getAppleClient } from '../lib/apple';
import { getGoogleClient } from '../lib/google';
import { errors } from 'oidc-provider';
import { FederatedTokens } from '../types/FederatedTokens';

export interface FederatedClientsConfig {
  federatedClients: AppConfig['federatedClients'];
  serverUrl: string;
  serverUrlProd?: string;
}

export class FederatedClients {
  private _googleClient: Configuration | undefined;
  private _appleClient: Configuration | undefined;

  constructor(private config: FederatedClientsConfig) {}

  googleRedirectUri = (): string => {
    return `${this.config.serverUrl}/oidc/interaction/callback/google`;
  };

  googleClient = async (): Promise<Configuration> => {
    if (!this._googleClient) {
      const {
        federatedClients: {
          google: { clientId },
        },
      } = this.config;
      this._googleClient = await getGoogleClient(
        clientId,
        this.googleRedirectUri()
      );
    }
    return this._googleClient;
  };

  googleIdTokenClaims = async (
    nonce: string,
    uid: string,
    callbackBody: Record<string, string>
  ): Promise<{ federatedTokens: FederatedTokens; claims: IDToken }> => {
    try {
      const currentUrl = new URL(
        'https://dummy#' + new URLSearchParams(callbackBody).toString()
      );
      const idToken = await implicitAuthentication(
        await this.googleClient(),
        currentUrl,
        nonce,
        { expectedState: uid }
      );
      const googleOAuth2Client = new GoogleOAuth2Client();
      await googleOAuth2Client.verifyIdToken({
        idToken: callbackBody.id_token!,
        audience: this.config.federatedClients.google.clientId,
      });
      return {
        federatedTokens: {
          id_token: callbackBody.id_token,
        },
        claims: idToken,
      };
    } catch (e) {
      console.error(e);
      throw new errors.InvalidToken('invalid google id_token');
    }
  };

  appleRedirectUri = (): string => {
    return `${this.config.serverUrlProd || this.config.serverUrl}/oidc/interaction/callback/apple`;
  };

  appleClient = async (): Promise<Configuration> => {
    if (!this._appleClient) {
      const {
        federatedClients: {
          apple: { teamId, clientId, privateKey, keyId },
        },
      } = this.config;
      const clientSecret = jwt.sign(
        {
          iss: teamId,
          aud: 'https://appleid.apple.com',
          sub: clientId,
        },
        privateKey,
        {
          algorithm: 'ES256',
          expiresIn: 15777000,
          header: {
            alg: 'ES256',
            kid: keyId,
          },
        }
      );
      this._appleClient = await getAppleClient(
        clientId,
        clientSecret,
        this.appleRedirectUri()
      );
    }
    return this._appleClient;
  };

  appleIdTokenClaims = async (
    nonce: string,
    uid: string,
    callbackBody: Record<string, string>
  ): Promise<{ federatedTokens: FederatedTokens; claims: IDToken }> => {
    try {
      const currentUrl = new URL(
        this.appleRedirectUri() +
          '?' +
          new URLSearchParams(callbackBody).toString()
      );
      const tokenset = await authorizationCodeGrant(
        await this.appleClient(),
        currentUrl,
        {
          expectedNonce: nonce,
          expectedState: uid,
        }
      );
      const claims = tokenset.claims();
      const {
        access_token,
        token_type,
        id_token,
        refresh_token,
        scope,
        expires_in,
      } = tokenset;
      return {
        federatedTokens: {
          access_token,
          token_type,
          id_token,
          refresh_token,
          scope,
          expires_at: expires_in
            ? Math.floor(Date.now() / 1000) + expires_in
            : undefined,
        },
        claims: claims!,
      };
    } catch (e) {
      console.error(e);
      throw new errors.InvalidToken('invalid apple id_token');
    }
  };
}

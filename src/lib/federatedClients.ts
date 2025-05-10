import { OAuth2Client as GoogleOAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { CallbackParamsType, Client, IdTokenClaims } from 'openid-client';
import { AppConfig } from '../types/AppConfig';
import { getAppleClient } from '../lib/apple';
import { getGoogleClient } from '../lib/google';
import { errors } from 'oidc-provider';

export interface FederatedClientsConfig {
  federatedClients: AppConfig['federatedClients'];
  serverUrl: string;
  serverUrlProd?: string;
}

export class FederatedClients {
  private _googleClient: Client;
  private _appleClient: Client;

  constructor(private config: FederatedClientsConfig) {}

  googleClient = async () => {
    if (!this._googleClient) {
      const {
        serverUrl,
        federatedClients: {
          google: { clientId },
        },
      } = this.config;
      const callbackUrl = `${serverUrl}/oidc/interaction/callback/google`;
      this._googleClient = await getGoogleClient(clientId, callbackUrl);
    }
    return this._googleClient;
  };

  googleIdTokenClaims = async (
    nonce: string,
    uid: string,
    callbackParams: CallbackParamsType
  ): Promise<IdTokenClaims> => {
    try {
      const tokenset = await (
        await this.googleClient()
      ).callback(undefined, callbackParams, {
        nonce,
        state: uid,
        response_type: 'id_token',
      });
      const googleOAuth2Client = new GoogleOAuth2Client();
      await googleOAuth2Client.verifyIdToken({
        idToken: tokenset.id_token!,
        audience: this.config.federatedClients.google.clientId,
      });
      return tokenset.claims();
    } catch (e) {
      console.error(e);
      throw new errors.InvalidToken('invalid google id_token');
    }
  };

  appleClient = async () => {
    if (!this._appleClient) {
      const {
        serverUrl,
        serverUrlProd,
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
      const callbackUrl = `${serverUrlProd || serverUrl}/oidc/interaction/callback/apple`;
      this._appleClient = await getAppleClient(
        clientId,
        clientSecret,
        callbackUrl
      );
    }
    return this._appleClient;
  };

  appleIdTokenClaims = async (
    nonce: string,
    uid: string,
    callbackParams: CallbackParamsType
  ) => {
    try {
      const tokenset = await (
        await this.appleClient()
      ).callback(undefined, callbackParams, {
        nonce,
        state: uid,
        response_type: 'code',
      });
      return tokenset.claims();
    } catch (e) {
      console.error(e);
      throw new errors.InvalidToken('invalid apple id_token');
    }
  };
}

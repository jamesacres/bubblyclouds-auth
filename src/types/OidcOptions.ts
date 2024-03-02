import { JWK } from 'oidc-provider';
import { AppConfig } from './AppConfig';

export interface OidcOptions {
  appConfig: AppConfig;
  issuer: string;
  keys: JWK[];
}

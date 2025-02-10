import { JWK } from 'oidc-provider';
import { AppConfig } from './AppConfig';
import { Ses } from '../lib/ses';
import { SignInCode } from '../lib/signInCode';

export interface OidcOptions {
  appConfig: AppConfig;
  issuer: string;
  keys: JWK[];
  ses: Ses;
  signInCode: SignInCode;
}

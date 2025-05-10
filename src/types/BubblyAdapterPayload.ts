import { AdapterPayload } from 'oidc-provider';
import { BubblyUserProfile } from './BubblyUserProfile';
import { IdentityProvider } from './IdentityProvider';
import { FederatedTokens } from './FederatedTokens';

export interface BubblyAdapterPayload extends AdapterPayload {
  profile?: BubblyUserProfile;
  federatedProvider?: IdentityProvider;
  federatedTokens?: {
    [provider in IdentityProvider]?: FederatedTokens;
  };
  signInCode?: string;
  createdAt?: string;
  updatedAt?: string;
}

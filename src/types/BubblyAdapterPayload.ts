import { AdapterPayload } from 'oidc-provider';
import { BubblyUserProfile } from './BubblyUserProfile';
import { IdentityProvider } from './IdentityProvider';

export interface BubblyAdapterPayload extends AdapterPayload {
  profile?: BubblyUserProfile;
  federatedProvider?: IdentityProvider;
  createdAt?: string;
  updatedAt?: string;
}

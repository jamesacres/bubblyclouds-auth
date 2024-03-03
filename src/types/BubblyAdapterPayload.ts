import { AdapterPayload } from 'oidc-provider';
import { BubblyUserProfile } from './BubblyUserProfile';
import { FederatedProvider } from './FederatedProvider';

export interface BubblyAdapterPayload extends AdapterPayload {
  profile?: BubblyUserProfile;
  federatedProvider?: FederatedProvider;
  createdAt?: string;
  updatedAt?: string;
}

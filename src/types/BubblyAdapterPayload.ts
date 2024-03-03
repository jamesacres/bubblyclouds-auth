import { AdapterPayload } from 'oidc-provider';
import { BubblyUserProfile } from './BubblyUserProfile';

export interface BubblyAdapterPayload extends AdapterPayload {
  profile?: BubblyUserProfile;
  createdAt?: string;
  updatedAt?: string;
}

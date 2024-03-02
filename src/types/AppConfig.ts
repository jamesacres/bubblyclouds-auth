import { ClientMetadata } from 'oidc-provider';

export interface AppConfig {
  serverUrl: string;
  clients: ClientMetadata[];
  federatedClients: {
    google: {
      clientId: string;
    };
  };
}

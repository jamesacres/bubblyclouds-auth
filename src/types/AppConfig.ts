import { ClientMetadata, ResourceServer } from 'oidc-provider';

export interface AppConfig {
  serverUrl: string;
  clients: ClientMetadata[];
  federatedClients: {
    google: {
      clientId: string;
    };
  };
  resources: {
    [key: string]: {
      allowedClientIds: string[];
      config?: Partial<ResourceServer>;
    };
  };
}

import { ClientMetadata, ResourceServer } from 'oidc-provider';

export interface AppConfig {
  serverUrl: string;
  clients: ClientMetadata[];
  cookies: { secretKeys: string[] };
  federatedClients: {
    google: {
      clientId: string;
    };
  };
  resources: {
    [key: string]: {
      allowedClientIds: string[];
      clientIdScope?: {
        [clientId: string]: string;
      };
      config?: Partial<ResourceServer>;
    };
  };
}

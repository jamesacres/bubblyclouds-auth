import { ClientMetadata, ResourceServer } from 'oidc-provider';

export interface AppConfig {
  serverUrl: string;
  serverUrlProd?: string;
  clients: ClientMetadata[];
  cookies: { secretKeys: string[] };
  federatedClients: {
    google: {
      clientId: string;
    };
    apple: {
      clientId: string;
      privateKey: string;
      teamId: string;
      keyId: string;
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

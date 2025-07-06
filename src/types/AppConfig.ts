import { ClientMetadata, ResourceServer } from 'oidc-provider';
import { SesConfig } from '../lib/ses';

export interface DemoAccounts {
  [email: string]: { signInCode: string } | undefined;
}

export interface AppConfig {
  aws: {
    ses: SesConfig;
  };
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
  demoAccounts: DemoAccounts;
}

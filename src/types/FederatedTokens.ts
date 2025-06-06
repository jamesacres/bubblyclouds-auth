export interface FederatedTokens {
  access_token?: string;
  token_type?: string;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_at?: number;
  session_state?: string;
}

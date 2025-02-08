import openid, { Client } from 'openid-client';

let appleClient: Client;
export const getAppleClient = async (
  clientId: string,
  clientSecret: string,
  redirectUrl: string
) => {
  if (!appleClient) {
    const apple = await openid.Issuer.discover(
      'https://appleid.apple.com/.well-known/openid-configuration'
    );
    appleClient = new apple.Client({
      client_id: clientId,
      client_secret: clientSecret,
      response_types: ['code'],
      redirect_uris: [redirectUrl],
      grant_types: ['authorization_code'],
    });
  }
  return appleClient;
};

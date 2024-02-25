import openid, { Client } from 'openid-client';

let googleClient: Client;
export const getGoogleClient = async (
  clientId: string,
  redirectUrl: string
) => {
  if (!googleClient) {
    const google = await openid.Issuer.discover(
      'https://accounts.google.com/.well-known/openid-configuration'
    );
    googleClient = new google.Client({
      client_id: clientId,
      response_types: ['id_token'],
      redirect_uris: [redirectUrl],
      grant_types: ['implicit'],
    });
  }
  return googleClient;
};

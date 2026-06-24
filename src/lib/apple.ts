import { Configuration, ClientSecretPost, discovery } from 'openid-client';

let appleClient: Configuration;
export const getAppleClient = async (
  clientId: string,
  clientSecret: string,
  redirectUrl: string
) => {
  if (!appleClient) {
    appleClient = await discovery(
      new URL('https://appleid.apple.com/.well-known/openid-configuration'),
      clientId,
      {
        client_secret: clientSecret,
        response_types: ['code'],
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code'],
      },
      ClientSecretPost(clientSecret)
    );
  }
  return appleClient;
};

import {
  Configuration,
  discovery,
  useIdTokenResponseType,
} from 'openid-client';

let googleClient: Configuration;
export const getGoogleClient = async (
  clientId: string,
  redirectUrl: string
) => {
  if (!googleClient) {
    googleClient = await discovery(
      new URL('https://accounts.google.com/.well-known/openid-configuration'),
      clientId,
      {
        response_types: ['id_token'],
        redirect_uris: [redirectUrl],
        grant_types: ['implicit'],
      }
    );
    useIdTokenResponseType(googleClient);
  }
  return googleClient;
};

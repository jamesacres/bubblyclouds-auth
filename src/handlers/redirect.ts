import { Handler } from 'aws-lambda';

export const handler: Handler = async () => {
  return {
    statusCode: 301,
    headers: { Location: 'https://bubblyclouds.com' },
  };
};

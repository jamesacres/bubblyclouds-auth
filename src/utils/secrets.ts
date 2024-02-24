import {
  SecretsManagerClient,
  GetSecretValueCommand,
  GetSecretValueCommandInput,
} from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManagerClient({ region: 'eu-west-2' });

const getSecret = async (secretId: string): Promise<string> => {
  const params: GetSecretValueCommandInput = {
    SecretId: secretId,
  };
  const command = new GetSecretValueCommand(params);
  const result = await secretsManager.send(command);
  return result.SecretString || '';
};

export { getSecret };

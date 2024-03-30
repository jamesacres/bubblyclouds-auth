const getSecret = async (secretId: string): Promise<string> => {
  const url = `http://localhost:${process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT}/secretsmanager/get?secretId=${secretId}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN!,
      },
    });
    if (!response.ok) {
      const json = await response.json().catch((err) => err.message);
      console.error('Invalid response :', json);
      throw new Error(`Invalid ${response.status} response`);
    }
    const result = await response.json();
    return result.SecretString || '';
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

export { getSecret };

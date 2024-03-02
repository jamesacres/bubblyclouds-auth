import { App } from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { Template } from 'aws-cdk-lib/assertions';

test('Auth Stack', () => {
  const app = new App();
  const authStack = new AuthStack(app, 'AuthStack', {
    env: {
      account: '12345678',
      region: 'eu-west-2',
    },
    certificateArn: 'mockCertificateArn',
    domainName: 'mockdomain.test',
    subdomain: 'mocksubdomain',
    appConfig: {
      applicationName: 'mockapplicationname',
      environmentName: 'mockenvironmentname',
    },
  });
  const template = Template.fromStack(authStack);
  const json = template.toJSON();
  expect(json).toMatchSnapshot({
    Resources: {
      ...json.Resources,
      AuthOidcFunctionFEAD1639: {
        ...json.Resources.AuthOidcFunctionFEAD1639,
        Properties: {
          ...json.Resources.AuthOidcFunctionFEAD1639.Properties,
          Code: { S3Key: expect.any(String) },
        },
      },
    },
  });
});

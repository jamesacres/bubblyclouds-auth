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
  });
  const template = Template.fromStack(authStack);
  expect(template.toJSON()).toMatchSnapshot();
});

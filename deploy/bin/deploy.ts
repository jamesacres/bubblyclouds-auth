#!/usr/bin/env node
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';

if (
  !(
    process.env.AWS_ACCOUNT_ID &&
    process.env.AWS_DEFAULT_REGION &&
    process.env.CERTIFICATE_ARN &&
    process.env.DOMAIN_NAME &&
    process.env.SUBDOMAIN &&
    process.env.APP_CONFIG_APPLICATION_NAME &&
    ['dev', 'prod'].includes(process.env.ENV!)
  )
) {
  throw Error('Missing env, use npm run cdk:xxx and populate .env');
}

const app = new cdk.App();
new AuthStack(app, 'AuthStack', {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_DEFAULT_REGION,
  },
  certificateArn: process.env.CERTIFICATE_ARN,
  domainName: process.env.DOMAIN_NAME,
  subdomain: process.env.SUBDOMAIN,
  appConfig: {
    applicationName: process.env.APP_CONFIG_APPLICATION_NAME,
    environmentName: `${process.env.APP_CONFIG_APPLICATION_NAME}-${process.env.ENV}`,
  },
});

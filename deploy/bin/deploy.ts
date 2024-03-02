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
    process.env.SUBDOMAIN
  )
) {
  throw Error('Missing env');
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
    applicationName: 'bubblyclouds-auth',
    environmentName: 'bubblyclouds-auth-prod',
  },
});

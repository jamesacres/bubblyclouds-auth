import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  DomainName,
  EndpointType,
  LambdaIntegration,
  MethodLoggingLevel,
  RestApi,
  SecurityPolicy,
} from 'aws-cdk-lib/aws-apigateway';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface AuthStackProps extends StackProps {
  certificateArn: string;
  domainName: string;
  subdomain: string;
}

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      props.certificateArn
    );

    const authGateway = new RestApi(this, 'AuthGateway', {
      restApiName: 'AuthGateway',
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: MethodLoggingLevel.ERROR,
        tracingEnabled: true,
      },
      cloudWatchRole: true,
      endpointTypes: [EndpointType.EDGE],
    });

    const domain = new DomainName(this, 'AuthDomain', {
      certificate,
      domainName: `${props.subdomain}.${props.domainName}`,
      securityPolicy: SecurityPolicy.TLS_1_2,
      endpointType: EndpointType.EDGE,
    });
    domain.addBasePathMapping(authGateway);

    const oidcFn = new NodejsFunction(this, `AuthOidcFunction`, {
      entry: path.resolve(__dirname, '../../src/handlers/oidc.ts'),
      functionName: `AuthOidc`,
      handler: 'handler',
      memorySize: 128,
      environment: {},
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      bundling: {},
      logRetention: RetentionDays.ONE_WEEK,
    });

    const oidcResource = authGateway.root.addResource('oidc');
    const jwksResource = oidcResource.addResource('jwks');

    const oidcLambdaIntegration = new LambdaIntegration(oidcFn);
    jwksResource.addMethod('GET', oidcLambdaIntegration);
  }
}

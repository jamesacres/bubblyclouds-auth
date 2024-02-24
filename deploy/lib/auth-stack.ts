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
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
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
    const { certificateArn, domainName, subdomain } = props;

    const authGateway = this.gateway();
    this.domain(authGateway, {
      certificateArn,
      domainName,
      subdomain,
    });

    const { oidc, redirect } = this.lambdas();

    const { sigRSA } = this.secrets();
    sigRSA.grantRead(oidc.fn);

    authGateway.root.addMethod('GET', redirect.integration);

    const oidcResource = authGateway.root.addResource('oidc');
    oidcResource.addMethod('GET', redirect.integration);

    const jwksResource = oidcResource.addResource('jwks');
    jwksResource.addMethod('GET', oidc.integration);
  }

  private gateway() {
    return new RestApi(this, 'AuthGateway', {
      restApiName: 'AuthGateway',
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: MethodLoggingLevel.ERROR,
        tracingEnabled: true,
      },
      cloudWatchRole: true,
      endpointTypes: [EndpointType.EDGE],
    });
  }

  private domain(
    authGateway: RestApi,
    {
      certificateArn,
      domainName,
      subdomain,
    }: {
      certificateArn: string;
      domainName: string;
      subdomain: string;
    }
  ) {
    const certificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      certificateArn
    );
    const domain = new DomainName(this, 'AuthDomain', {
      certificate,
      domainName: `${subdomain}.${domainName}`,
      securityPolicy: SecurityPolicy.TLS_1_2,
      endpointType: EndpointType.EDGE,
    });
    domain.addBasePathMapping(authGateway);
  }

  private secrets() {
    return {
      sigRSA: new Secret(this, 'sigRSA', { secretName: 'sigRSA' }),
    };
  }

  private lambdas() {
    const config: NodejsFunctionProps = {
      handler: 'handler',
      memorySize: 128,
      environment: {},
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      bundling: {},
      logRetention: RetentionDays.ONE_WEEK,
    };

    const redirectFn = new NodejsFunction(this, `AuthRedirectFunction`, {
      ...config,
      entry: path.resolve(__dirname, '../../src/handlers/redirect.ts'),
      functionName: `AuthRedirect`,
    });

    const oidcFn = new NodejsFunction(this, `AuthOidcFunction`, {
      ...config,
      entry: path.resolve(__dirname, '../../src/handlers/oidc.ts'),
      functionName: `AuthOidc`,
    });

    return {
      redirect: {
        fn: redirectFn,
        integration: new LambdaIntegration(redirectFn),
      },
      oidc: { fn: oidcFn, integration: new LambdaIntegration(oidcFn) },
    };
  }
}

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
import { AttributeType, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
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

    const { table } = this.dynamodb();
    table.grantReadWriteData(oidc.fn);

    // GET /
    authGateway.root.addMethod('GET', redirect.integration);

    const jwksResource = authGateway.root.addResource('jwks');
    // GET /jwks
    jwksResource.addMethod('GET', oidc.integration);

    const wellKnownResource = authGateway.root.addResource('.well-known');
    const openidConfigurationResource = wellKnownResource.addResource(
      'openid-configuration'
    );
    // GET /.well-known/openid-configuration
    openidConfigurationResource.addMethod('GET', oidc.integration);

    const oidcResource = authGateway.root.addResource('oidc');
    // GET /oidc
    oidcResource.addMethod('GET', redirect.integration);

    const authResource = oidcResource.addResource('auth');
    authResource.addMethod('GET', oidc.integration);

    const interactionResource = oidcResource.addResource('interaction');

    const interactionCallbackResource =
      interactionResource.addResource('callback');
    const interactionCallbackGoogleResource =
      interactionCallbackResource.addResource('google');
    // GET /interaction/callback/google
    interactionCallbackGoogleResource.addMethod('GET', oidc.integration);

    const interactionUidResource = interactionResource.addResource('{uid}');
    // GET /interaction/:uid
    interactionUidResource.addMethod('GET', oidc.integration);

    const interactionUidFederatedResource =
      interactionUidResource.addResource('federated');
    // POST /interaction/:uid/federated
    interactionUidFederatedResource.addMethod('POST', oidc.integration);

    const interactionUidFederatedGoogleResource =
      interactionUidFederatedResource.addResource('google');
    // GET /interaction/:uid/federated/google
    interactionUidFederatedGoogleResource.addMethod('GET', oidc.integration);

    const interactionUidConfirmResource =
      interactionUidResource.addResource('confirm');
    // POST /interaction/:uid/confirm
    interactionUidConfirmResource.addMethod('POST', oidc.integration);

    const interactionUidAbortResource =
      interactionUidResource.addResource('abort');
    // GET /interaction/:uid/abort
    interactionUidAbortResource.addMethod('GET', oidc.integration);
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

  private dynamodb() {
    const table = new Table(this, 'AuthTable', {
      partitionKey: { name: 'modelId', type: AttributeType.STRING },
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expiresAt',
      deletionProtection: true,
    });

    // As per src/adapters/dynamodb.ts define secondary indexes
    ['uid', 'grantId', 'userCode'].map((column) =>
      table.addGlobalSecondaryIndex({
        indexName: `${column}Index`,
        partitionKey: { name: column, type: AttributeType.STRING },
        projectionType: ProjectionType.ALL,
      })
    );

    return { table };
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
      environment: {
        DEBUG: 'oidc-provider:*',
        OAUTH_TABLE: 'AuthStack-AuthTable0711E62F-15KG9EHHEGFYW',
      },
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

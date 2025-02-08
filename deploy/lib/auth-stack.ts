import { Duration, Fn, Stack, StackProps } from 'aws-cdk-lib';
import {
  CfnApplication,
  CfnConfigurationProfile,
  CfnEnvironment,
} from 'aws-cdk-lib/aws-appconfig';
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
import {
  LayerVersion,
  ParamsAndSecretsLayerVersion,
  ParamsAndSecretsLogLevel,
  ParamsAndSecretsVersions,
  Runtime,
} from 'aws-cdk-lib/aws-lambda';
import {
  NodejsFunction,
  NodejsFunctionProps,
} from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface AuthStackProps extends StackProps {
  certificateArn: string;
  domainName: string;
  subdomain: string;
  appConfig: { applicationName: string; environmentName: string };
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

    const appConfig = this.appConfig(props.appConfig);
    const { oidc, redirect } = this.lambdas({
      appConfig,
      accountId: props.env!.account!,
      region: props.env!.region!,
    });

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

    // GET /oidc/jwks
    const oidcJwksResource = oidcResource.addResource('jwks');
    oidcJwksResource.addMethod('GET', oidc.integration);

    const authResource = oidcResource.addResource('auth');
    // GET /oidc/auth
    authResource.addMethod('GET', oidc.integration);
    const authUidResource = authResource.addResource('{uid}');
    // GET /oidc/auth/:uid
    authUidResource.addMethod('GET', oidc.integration);

    const tokenResource = oidcResource.addResource('token');
    // POST /oidc/token
    tokenResource.addMethod('POST', oidc.integration);

    const sessionResource = oidcResource.addResource('session');

    const sessionEndResource = sessionResource.addResource('end');
    // GET /oidc/session/end
    sessionEndResource.addMethod('GET', oidc.integration);

    const sessionEndConfirmResource = sessionEndResource.addResource('confirm');
    // POST /oidc/session/end/confirm
    sessionEndConfirmResource.addMethod('POST', oidc.integration);

    const sessionEndSuccessResource = sessionEndResource.addResource('success');
    // GET /oidc/session/end/success
    sessionEndSuccessResource.addMethod('GET', oidc.integration);

    const interactionResource = oidcResource.addResource('interaction');

    const interactionCallbackResource =
      interactionResource.addResource('callback');

    const interactionCallbackGoogleResource =
      interactionCallbackResource.addResource('google');
    // GET /oidc/interaction/callback/google
    interactionCallbackGoogleResource.addMethod('GET', oidc.integration);

    const interactionCallbackAppleResource =
      interactionCallbackResource.addResource('apple');
    // POST /oidc/interaction/callback/apple
    interactionCallbackAppleResource.addMethod('POST', oidc.integration);

    const interactionUidResource = interactionResource.addResource('{uid}');
    // GET /oidc/interaction/:uid
    interactionUidResource.addMethod('GET', oidc.integration);

    const interactionUidFederatedResource =
      interactionUidResource.addResource('federated');
    // POST /oidc/interaction/:uid/federated
    interactionUidFederatedResource.addMethod('POST', oidc.integration);

    const interactionUidFederatedGoogleResource =
      interactionUidFederatedResource.addResource('google');
    // GET /oidc/interaction/:uid/federated/google
    interactionUidFederatedGoogleResource.addMethod('GET', oidc.integration);

    const interactionUidFederatedAppleResource =
      interactionUidFederatedResource.addResource('apple');
    // GET /oidc/interaction/:uid/federated/apple
    interactionUidFederatedAppleResource.addMethod('GET', oidc.integration);

    const interactionUidConfirmResource =
      interactionUidResource.addResource('confirm');
    // POST /oidc/interaction/:uid/confirm
    interactionUidConfirmResource.addMethod('POST', oidc.integration);

    const interactionUidAbortResource =
      interactionUidResource.addResource('abort');
    // GET /oidc/interaction/:uid/abort
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

  private appConfig(options: AuthStackProps['appConfig']): {
    application: CfnApplication;
    environment: CfnEnvironment;
    configuration: CfnConfigurationProfile;
  } {
    const application = new CfnApplication(this, `AuthAppConfigApplication`, {
      name: options.applicationName,
    });
    const environment = new CfnEnvironment(this, 'AuthAppConfigEnvironment', {
      applicationId: application.ref,
      name: options.environmentName,
    });
    const configuration = new CfnConfigurationProfile(
      this,
      `AuthAppConfigConfigurationProfile`,
      {
        applicationId: application.ref,
        locationUri: 'hosted',
        name: options.environmentName,
        type: 'AWS.Freeform',
      }
    );
    return {
      application,
      environment,
      configuration,
    };
  }

  private lambdas(options: {
    accountId: string;
    region: string;
    appConfig: {
      application: CfnApplication;
      environment: CfnEnvironment;
      configuration: CfnConfigurationProfile;
    };
  }) {
    const config: NodejsFunctionProps = {
      handler: 'handler',
      memorySize: 128,
      environment: {},
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
      logRetention: RetentionDays.ONE_WEEK,
    };

    const redirectFn = new NodejsFunction(this, `AuthRedirectFunction`, {
      ...config,
      entry: path.resolve(__dirname, '../../src/handlers/redirect.ts'),
      functionName: `AuthRedirect`,
    });

    const paramsAndSecrets = ParamsAndSecretsLayerVersion.fromVersion(
      ParamsAndSecretsVersions.V1_0_103,
      { logLevel: ParamsAndSecretsLogLevel.DEBUG }
    );

    const oidcFn = new NodejsFunction(this, `AuthOidcFunction`, {
      ...config,
      paramsAndSecrets,
      memorySize: 512,
      entry: path.resolve(__dirname, '../../src/handlers/oidc.ts'),
      functionName: `AuthOidc`,
      environment: {
        DEBUG: 'oidc-provider:*',
        OAUTH_TABLE: 'AuthStack-AuthTable0711E62F-15KG9EHHEGFYW',
        // https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-integration-lambda-extensions.html
        AWS_APPCONFIG_EXTENSION_PREFETCH_LIST: Fn.sub(
          '/applications/${applicationId}/environments/${environmentId}/configurations/${configurationId}',
          {
            applicationId: options.appConfig.application.name,
            environmentId: options.appConfig.environment.name,
            configurationId: options.appConfig.configuration.name,
          }
        ),
      },
      layers: [
        LayerVersion.fromLayerVersionArn(
          this,
          'AppConfigLambdaLayer',
          'arn:aws:lambda:eu-west-2:282860088358:layer:AWS-AppConfig-Extension:93'
        ),
      ],
    });
    oidcFn.addToRolePolicy(
      new PolicyStatement({
        resources: [
          Fn.sub(
            'arn:aws:appconfig:${region}:${accountId}:application/${applicationId}/environment/${environmentId}/configuration/${configurationId}',
            {
              region: options.region,
              accountId: options.accountId,
              applicationId: options.appConfig.application.ref,
              environmentId: options.appConfig.environment.ref,
              configurationId: options.appConfig.configuration.ref,
            }
          ),
        ],
        actions: [
          'appconfig:GetLatestConfiguration',
          'appconfig:StartConfigurationSession',
        ],
      })
    );

    return {
      redirect: {
        fn: redirectFn,
        integration: new LambdaIntegration(redirectFn),
      },
      oidc: { fn: oidcFn, integration: new LambdaIntegration(oidcFn) },
    };
  }
}

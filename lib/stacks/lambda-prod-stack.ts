import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export class LambdaProdStack extends cdk.Stack {
  public readonly apiUrlOutput: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new lambda.Function(this, 'DemoLambdaProd', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
              'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            },
            body: JSON.stringify({ message: 'Hello from PROD (IAM protected)' }),
          };
        };
      `),
      description: 'Prod Lambda behind API Gateway + WAF',
    });

    // API Gateway (Regional) with IAM auth
    const api = new apigw.RestApi(this, 'ProdApi', {
      restApiName: 'ProdApi',
      description: 'Prod API protected by IAM and WAF',
      endpointConfiguration: { types: [apigw.EndpointType.REGIONAL] },
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
      },
      cloudWatchRole: true,
    });

    const integration = new apigw.LambdaIntegration(fn);
    const resource = api.root.addResource('hello');
    resource.addMethod('GET', integration, {
      authorizationType: apigw.AuthorizationType.IAM, // Require SigV4
      apiKeyRequired: false,
    });

    // Minimal WAFv2 (AWS Managed Rule Groups)
    const webAcl = new wafv2.CfnWebACL(this, 'ProdWebAcl', {
      name: 'ProdApiWebAcl',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'ProdApiWebAcl',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesCommonRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRules',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputs',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'ProdWebAclAssoc', {
      resourceArn: `arn:aws:apigateway:${cdk.Stack.of(this).region}::/restapis/${api.restApiId}/stages/${api.deploymentStage.stageName}`,
      webAclArn: webAcl.attrArn,
    });

    this.apiUrlOutput = new cdk.CfnOutput(this, 'ApiUrl', {
      value: `${api.url}hello`,
      description: 'Prod API URL (IAM-protected)',
      exportName: `${cdk.Stack.of(this).stackName}-ApiUrl`,
    });
  }
}
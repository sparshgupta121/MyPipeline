import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class LambdaTestStack extends cdk.Stack {
  public readonly functionUrlOutput: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const fn = new lambda.Function(this, 'DemoLambdaTest', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const name = (event?.queryStringParameters?.name) || "Team";
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'text/html',
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'DENY',
              'X-XSS-Protection': '1; mode=block'
            },
            body: \`<html><head><title>Demo</title></head><body><h1>Hello, \${name}</h1></body></html>\`,
          };
        };
      `),
      description: 'Test Lambda with public Function URL for DAST',
    });

    const url = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE, // public for TEST
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
      },
    });

    this.functionUrlOutput = new cdk.CfnOutput(this, 'FunctionUrl', {
      value: url.url,
      description: 'Public HTTPS URL (used by DAST in test pipeline)',
      exportName: `${cdk.Stack.of(this).stackName}-FunctionUrl`,
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class TriggerProdLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda that starts the prod pipeline
    const triggerLambda = new lambda.Function(this, 'TriggerProdPipeline', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cp = new AWS.CodePipeline();

        exports.handler = async () => {
          await cp.startPipelineExecution({
            name: 'prod-pipeline'
          }).promise();
          return 'Prod pipeline started';
        };
      `),
      timeout: cdk.Duration.seconds(30),
    });

    // Principle of least privilege: scope to the specific Prod pipeline ARN
    const pipelineArn = cdk.Stack.of(this).formatArn({
      service: 'codepipeline',
      resource: 'prod-pipeline',
      region: cdk.Stack.of(this).region,
      account: cdk.Stack.of(this).account,
      resourceName: undefined,
    });

    triggerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['codepipeline:StartPipelineExecution'],
        resources: [pipelineArn],
      })
    );

    // EventBridge rule: fire only when the ManualApproval action SUCCEEDS
    new events.Rule(this, 'OnManualApprovalSuccess', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Action Execution State Change'],
        detail: {
          pipeline: ['test-pipeline'],
          state: ['SUCCEEDED'],
          // Action name must match the ManualApprovalStep name
          action: ['ApproveProdDeploy'],
          // Extra safety: only Approval category actions
          type: {
            category: ['Approval']
          }
        },
      },
      targets: [new targets.LambdaFunction(triggerLambda)],
    });
  }
}


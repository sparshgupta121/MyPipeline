
// trigger-prod-lambda-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class TriggerProdLambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const triggerLambda = new lambda.Function(this, 'TriggerProdPipeline', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cp = new AWS.CodePipeline();

        exports.handler = async (event) => {
          console.log('Approval event:', JSON.stringify(event, null, 2));

          // ✅ Correct field name
          if (event.detail.state !== 'SUCCEEDED') return;

          await cp.startPipelineExecution({
            name: 'prod-pipeline',
          }).promise();

          console.log('✅ Prod pipeline triggered');
        };
      `),
    });

    triggerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'codepipeline:StartPipelineExecution',
        ],
        resources: ['*'],
      })
    );

    // ✅ Correct & reliable event rule
    new events.Rule(this, 'ApprovalTriggersProd', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Action Execution State Change'],
        detail: {
          pipeline: ['test-pipeline'],
          action: ['ApproveProdDeploy'],
          state: ['SUCCEEDED'],
        },
      },
      targets: [new targets.LambdaFunction(triggerLambda)],
    });
  }
}

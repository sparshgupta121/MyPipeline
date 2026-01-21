
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
      timeout: cdk.Duration.seconds(60),
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cp = new AWS.CodePipeline();

        async function getProdSourceActionName(prodPipelineName) {
          const res = await cp.getPipeline({ name: prodPipelineName }).promise();
          const stage = res.pipeline.stages.find(s =>
            (s.actions || []).some(a => a.actionTypeId.category === 'Source')
          );
          if (!stage) throw new Error('Source stage not found in prod pipeline');

          const action = stage.actions.find(
            a => a.actionTypeId.category === 'Source'
          );
          if (!action) throw new Error('Source action not found');

          return action.name;
        }

        async function getTestRevisionId(testPipelineName, executionId) {
          const res = await cp.getPipelineExecution({
            pipelineName: testPipelineName,
            pipelineExecutionId: executionId,
          }).promise();

          const pe = res.pipelineExecution;
          if (pe.artifactRevisions && pe.artifactRevisions.length > 0) {
            return pe.artifactRevisions[0].revisionId;
          }

          throw new Error('No revisionId found for test execution');
        }

        exports.handler = async (event) => {
          console.log('Approval event:', JSON.stringify(event, null, 2));

          const testPipeline = 'test-pipeline';
          const prodPipeline = 'prod-pipeline';
          const executionId = event.detail['execution-id'];

          if (!executionId) {
            throw new Error('Missing execution-id from approval event');
          }

          const revisionId = await getTestRevisionId(testPipeline, executionId);
          const sourceAction = await getProdSourceActionName(prodPipeline);

          await cp.startPipelineExecution({
            name: prodPipeline,
            sourceRevisions: [
              {
                actionName: sourceAction,
                revisionId: revisionId,
              }
            ]
          }).promise();

          console.log('Prod pipeline started for commit:', revisionId);
        };
      `),
    });

    triggerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'codepipeline:GetPipeline',
          'codepipeline:GetPipelineExecution',
          'codepipeline:StartPipelineExecution',
        ],
        resources: ['*'],
      })
    );

    // ✅ Fires ONLY on approval success
    new events.Rule(this, 'ApproveTriggersProd', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Action Execution State Change'],
        detail: {
          pipeline: ['test-pipeline'],
          action: ['ApproveProdDeploy'],
          state: ['SUCCEEDED'],
          type: { category: ['Approval'] },
        },
      },
      targets: [new targets.LambdaFunction(triggerLambda)],
    });
  }
}

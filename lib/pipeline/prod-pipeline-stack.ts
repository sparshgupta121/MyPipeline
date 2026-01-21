
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} from 'aws-cdk-lib/pipelines';
import { PipelineStage } from './pipeline-stage';

import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';

export class ProdPipelineStack extends cdk.Stack {
  public static readonly PROD_PIPELINE_NAME = 'prod-pipeline';
  public static readonly TEST_PIPELINE_NAME = 'test-pipeline';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------- PROD PIPELINE ----------------
    const prodPipeline = new CodePipeline(this, 'ProdPipeline', {
      pipelineName: ProdPipelineStack.PROD_PIPELINE_NAME,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection(
          'sparshgupta121/MyPipeline',
          'main',
          {
            connectionArn:
              'arn:aws:codeconnections:us-east-1:836688626238:connection/7bef095f-cc78-4584-b015-2dd4ce931a2e',
            // triggerOnPush: false, // ✅ Critical: PROD never auto-runs
          }
        ),
        commands: ['npm ci', 'npm run build', 'npx cdk synth'],
      }),
    });

    prodPipeline.addStage(
      new PipelineStage(this, 'ProdStage', {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT!,
          region: process.env.CDK_DEFAULT_REGION!,
        },
      })
    );

    // ---------------- EVENTBRIDGE TRIGGER ----------------
    const importedProdPipeline = codepipeline.Pipeline.fromPipelineArn(
      this,
      'ImportedProdPipeline',
      `arn:aws:codepipeline:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${ProdPipelineStack.PROD_PIPELINE_NAME}`
    );

    new events.Rule(this, 'TriggerProdOnTestSuccess', {
      description:
        'Start PROD pipeline when TEST pipeline execution SUCCEEDS after manual approval',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [ProdPipelineStack.TEST_PIPELINE_NAME],
          state: ['SUCCEEDED'], // ✅ Happens only AFTER approval
        },
      },
      targets: [new targets.CodePipeline(importedProdPipeline)],
    });
  }
}

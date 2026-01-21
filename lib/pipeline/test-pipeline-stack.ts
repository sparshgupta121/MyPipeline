
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
  ManualApprovalStep,
} from 'aws-cdk-lib/pipelines';
import { PipelineStage } from './pipeline-stage';

export class TestPipelineStack extends cdk.Stack {
  public static readonly PIPELINE_NAME = 'test-pipeline';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'TestPipeline', {
      pipelineName: TestPipelineStack.PIPELINE_NAME,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection(
          'sparshgupta121/MyPipeline',
          'main',
          {
            connectionArn:
              'arn:aws:codeconnections:us-east-1:836688626238:connection/7bef095f-cc78-4584-b015-2dd4ce931a2e',
          }
        ),
        commands: ['npm ci', 'npm run build', 'npx cdk synth'],
      }),
    });

    const testStage = pipeline.addStage(
      new PipelineStage(this, 'TestStage', {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT!,
          region: process.env.CDK_DEFAULT_REGION!,
        },
      })
    );

    // ✅ This approval controls PROD
    testStage.addPost(new ManualApprovalStep('ApproveProdDeploy'));
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CodePipeline,
  CodePipelineSource,
  ShellStep,
} from 'aws-cdk-lib/pipelines';
import { PipelineStage } from './pipeline-stage';

export class ProdPipelineStack extends cdk.Stack {
  public static readonly PIPELINE_NAME = 'prod-pipeline';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'ProdPipeline', {
      pipelineName: ProdPipelineStack.PIPELINE_NAME,
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.connection(
          'sparshgupta121/MyPipeline',
          'main', // 👈 ONLY runs on main branch
          {
            connectionArn:
              'arn:aws:codeconnections:us-east-1:836688626238:connection/7bef095f-cc78-4584-b015-2dd4ce931a2e',
            triggerOnPush: true, // 👈 YES, run automatically on main branch push
          }
        ),
        commands: ['npm ci', 'npm run build', 'npx cdk synth'],
      }),
    });

    pipeline.addStage(
      new PipelineStage(this, 'ProdStage', {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT!,
          region: process.env.CDK_DEFAULT_REGION!,
        },
      })
    );
  }
}
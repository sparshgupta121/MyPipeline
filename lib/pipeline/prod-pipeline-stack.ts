
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CodePipeline,
  ShellStep,
  CodePipelineSource,
} from 'aws-cdk-lib/pipelines';
import { PipelineStage } from './pipeline-stage';

export class ProdPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'ProdPipeline', {
      pipelineName: 'prod-pipeline',
      synth: new ShellStep('Synth', {
        // ✅ Provide code for synth BUT DO NOT auto-trigger on push
        input: CodePipelineSource.connection(
          'sparshgupta121/MyPipeline',
          'main',
          {
            connectionArn:
              'arn:aws:codeconnections:us-east-1:836688626238:connection/7bef095f-cc78-4584-b015-2dd4ce931a2e',
            triggerOnPush: false, // 🔒 critical: prevents Prod auto-runs
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
``

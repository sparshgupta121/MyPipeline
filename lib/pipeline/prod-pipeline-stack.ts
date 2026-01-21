
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, ShellStep } from 'aws-cdk-lib/pipelines';
import { PipelineStage } from './pipeline-stage';

export class ProdPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'ProdPipeline', {
      pipelineName: 'prod-pipeline',
      synth: new ShellStep('Synth', {
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


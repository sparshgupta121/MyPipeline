
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaStack } from '../stacks/lambda-stack';

export class PipelineStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    // Put all workload stacks for that environment here
    new LambdaStack(this, 'LambdaStack');
  }
}


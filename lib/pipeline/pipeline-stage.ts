import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaTestStack } from '../stacks/lambda-test-stack';
import { LambdaProdStack } from '../stacks/lambda-prod-stack';

export class TestAppStage extends cdk.Stage {
  public readonly functionUrl: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    const stack = new LambdaTestStack(this, 'TestApp', props);
    this.functionUrl = stack.functionUrlOutput;
  }
}

export class ProdAppStage extends cdk.Stage {
  public readonly apiUrl: cdk.CfnOutput;

  constructor(scope: Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    const stack = new LambdaProdStack(this, 'ProdApp', props);
    this.apiUrl = stack.apiUrlOutput;
  }
}
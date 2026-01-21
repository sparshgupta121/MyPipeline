
import * as cdk from 'aws-cdk-lib';
import { TestPipelineStack } from '../lib/pipeline/test-pipeline-stack';
import { ProdPipelineStack } from '../lib/pipeline/prod-pipeline-stack';

const app = new cdk.App();

// Use CDK_DEFAULT_* for easy local + CI/CD usage
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// If you already know the exact account/region, you can hardcode:
// const env = { account: '111111111111', region: 'us-east-1' };

new ProdPipelineStack(app, 'ProdPipelineStack', { env });
new TestPipelineStack(app, 'TestPipelineStack', { env });


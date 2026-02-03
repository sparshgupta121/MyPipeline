#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TestPipelineStack } from '../lib/pipeline/test-pipeline-stack';
import { ProdPipelineStack } from '../lib/pipeline/prod-pipeline-stack';

const app = new cdk.App();

new TestPipelineStack(app, 'TestPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new ProdPipelineStack(app, 'ProdPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
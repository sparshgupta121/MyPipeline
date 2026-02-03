import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TestPipelineStack } from '../lib/pipeline/test-pipeline-stack';
import { ProdPipelineStack } from '../lib/pipeline/prod-pipeline-stack';

describe('Pipeline Stacks', () => {
  test('Test Pipeline Stack Created', () => {
    const app = new cdk.App();
    
    // Create the stack
    const stack = new TestPipelineStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    
    // Prepare the stack for assertions
    const template = Template.fromStack(stack);
    
    // Assert it creates a pipeline
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    
    // Assert it creates S3 bucket for reports
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });
  });

  test('Production Pipeline Stack Created', () => {
    const app = new cdk.App();
    
    // Create the stack
    const stack = new ProdPipelineStack(app, 'ProdStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    
    // Prepare the stack for assertions
    const template = Template.fromStack(stack);
    
    // Assert it creates a pipeline
    template.resourceCountIs('AWS::CodePipeline::Pipeline', 1);
    
    // Assert it creates S3 bucket for reports
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });
  });

  test('S3 Buckets Have Proper Security', () => {
    const app = new cdk.App();
    const stack = new TestPipelineStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    
    const template = Template.fromStack(stack);
    
    // Assert S3 buckets block public access
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    
    // Assert S3 buckets have versioning
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });
});
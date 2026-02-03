import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  CodePipeline,
  CodePipelineSource,
  CodeBuildStep,
} from 'aws-cdk-lib/pipelines';
import { ProdAppStage } from './pipeline-stage';

export class ProdPipelineStack extends cdk.Stack {
  public static readonly PIPELINE_NAME = 'prod-pipeline';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const reportsBucket = new s3.Bucket(this, 'SecurityReportsBucketProd', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(180) }],
    });

    const pipeline = new CodePipeline(this, 'ProdPipeline', {
      pipelineName: ProdPipelineStack.PIPELINE_NAME,
      synth: new CodeBuildStep('SynthWithSecurity', {
        input: CodePipelineSource.connection(
          'sparshgupta121/MyPipeline',
          'main',
          {
            connectionArn:
              'arn:aws:codeconnections:us-east-1:836688626238:connection/7bef095f-cc78-4584-b015-2dd4ce931a2e',
            triggerOnPush: true,
          }
        ),
        env: {
          REPORTS_BUCKET: reportsBucket.bucketName,
        },
        rolePolicyStatements: [
          new iam.PolicyStatement({
            actions: [
              's3:PutObject',
              's3:AbortMultipartUpload',
              's3:ListBucket',
              's3:PutObjectAcl',
            ],
            resources: [reportsBucket.bucketArn, `${reportsBucket.bucketArn}/*`],
          }),
        ],
        installCommands: [
          'echo "Preparing tools..."',
          'python3 -m pip install --user --upgrade pip',
          'python3 -m pip install --user semgrep checkov',
          'export PATH=$HOME/.local/bin:$PATH',

          // Node deps
          'npm ci',

          // Install CDK CLI locally so `npx cdk` is reliable in CodeBuild
          'npm install --no-save aws-cdk@2',

          // 🔒 Pin ESLint v8 & compatible parser/plugin
          'npm install --no-save -D eslint@8.57.0 eslint-plugin-security@1.7.1 @typescript-eslint/parser@6.21.0',

          // ESLint config & ignore
          'printf \'module.exports = { parser: "@typescript-eslint/parser", plugins: ["security"], extends: ["eslint:recommended", "plugin:security/recommended"], env: { node: true, es2021: true }, parserOptions: { ecmaVersion: 2021, sourceType: "module" } };\' > .eslintrc.cjs',
          'printf "node_modules\\ncdk.out\\ndist\\n" > .eslintignore',

          // Trivy (binary)
          'curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b .',
        ],
        commands: [
          'set -eu',
          'export PATH=$HOME/.local/bin:$PATH',

          // Use CodeBuild-provided commit SHA
          'REV=${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}',
          'REPORT_PREFIX="prod/${REV}-$(date +%Y%m%d%H%M%S)"',
          'mkdir -p reports',

          // --- SAST ---
          'echo "Running ESLint (security rules)..."',
          'npx eslint . --ext .ts || (echo "ESLint security issues found" && exit 1)',

          'echo "Running Semgrep SAST..."',
          'semgrep --config=auto --error --exclude node_modules --timeout=0 --json . > reports/semgrep.json',

          // --- SCA ---
          'echo "Running npm audit (SCA)..."',
          'npm audit --json > reports/npm-audit.json || true',
          'node -e \'const r=require("./reports/npm-audit.json"); const a=(r.vulnerabilities||r.metadata?.vulnerabilities)||{}; const high=(a.high||0)+(a.HIGH||0); const critical=(a.critical||0)+(a.CRITICAL||0); if (high+critical>0){console.error("High/Critical vulns:",{high,critical}); process.exit(1);} else {console.log("npm audit: no High/Critical");}\'',

          // Build & synth
          'echo "Building & Synthesizing CDK..."',
          'npm run build',
          'npx cdk synth',

          // --- IaC ---
          'echo "Running Checkov on CloudFormation templates..."',
          'checkov -d cdk.out --framework cloudformation -o json > reports/checkov.json || (echo "Checkov failed" && exit 1)',

          // --- Trivy FS ---
          'echo "Running Trivy FS scan..."',
          './trivy fs --security-checks vuln,secret,config --severity HIGH,CRITICAL --exit-code 1 --no-progress --format json -o reports/trivy-fs.json .',

          // Upload reports
          'aws s3 cp reports "s3://$REPORTS_BUCKET/$REPORT_PREFIX/" --recursive',
          'echo "Reports uploaded to s3://$REPORTS_BUCKET/$REPORT_PREFIX/"',
        ],
        primaryOutputDirectory: 'cdk.out',
      }),
    });

    pipeline.addStage(
      new ProdAppStage(this, 'ProdStage', {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT!,
          region: process.env.CDK_DEFAULT_REGION!,
        },
      })
    );
  }
}
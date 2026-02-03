import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import {
  CodePipeline,
  CodePipelineSource,
  CodeBuildStep,
  ManualApprovalStep,
} from 'aws-cdk-lib/pipelines';
import { TestAppStage } from './pipeline-stage';

export class TestPipelineStack extends cdk.Stack {
  public static readonly PIPELINE_NAME = 'test-pipeline';

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const reportsBucket = new s3.Bucket(this, 'SecurityReportsBucketTest', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });

    const pipeline = new CodePipeline(this, 'TestPipeline', {
      pipelineName: TestPipelineStack.PIPELINE_NAME,
      synth: new CodeBuildStep('SynthWithSecurity', {
        input: CodePipelineSource.connection(
          'sparshgupta121/MyPipeline',
          'test',
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

          // 🔒 Pin ESLint v8 to avoid v9 flat-config requirement
          'npm install --no-save -D eslint@8.57.0 eslint-plugin-security@1.7.1 @typescript-eslint/parser@6.21.0',

          // Write a minimal .eslintrc.cjs for ESLint v8
          'printf \'module.exports = { parser: "@typescript-eslint/parser", plugins: ["security"], extends: ["eslint:recommended", "plugin:security/recommended"], env: { node: true, es2021: true }, parserOptions: { ecmaVersion: 2021, sourceType: "module" } };\' > .eslintrc.cjs',

          // Trivy (binary)
          'curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b .',
        ],
        commands: [
          'set -eu',
          'export PATH=$HOME/.local/bin:$PATH',

          // Use CodeBuild-provided commit SHA; no .git in CodeBuild
          'REV=${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}',
          'REPORT_PREFIX="test/${REV}-$(date +%Y%m%d%H%M%S)"',
          'mkdir -p reports',

          // --- SAST ---
          'echo "Running ESLint (security rules)..."',
          'npx eslint . --ext .ts || (echo "ESLint security issues found" && exit 1)',

          'echo "Running Semgrep SAST..."',
          'semgrep --config=auto --error --exclude node_modules --timeout=0 --json . > reports/semgrep.json',

          // --- SCA ---
          'echo "Running npm audit (SCA)..."',
          'npm audit --json > reports/npm-audit.json || true',
          // Fail only on High/Critical
          'node -e \'const r=require("./reports/npm-audit.json"); const a=(r.vulnerabilities||r.metadata?.vulnerabilities)||{}; const high=(a.high||0)+(a.HIGH||0); const critical=(a.critical||0)+(a.CRITICAL||0); if (high+critical>0){console.error("High/Critical vulns:",{high,critical}); process.exit(1);} else {console.log("npm audit: no High/Critical");}\'',

          // Build & synth
          'echo "Building & Synthesizing CDK..."',
          'npm run build',
          'npx cdk synth',

          // --- IaC (Checkov) ---
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

    const testStage = new TestAppStage(this, 'TestStage', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT!,
        region: process.env.CDK_DEFAULT_REGION!,
      },
    });

    const stage = pipeline.addStage(testStage);

    // --- DAST (OWASP ZAP Baseline) after deploy ---
    stage.addPost(
      new CodeBuildStep('DAST-ZAP-Baseline', {
        buildEnvironment: { privileged: true }, // Docker needed for ZAP image
        envFromCfnOutputs: {
          TARGET_URL: testStage.functionUrl, // Lambda Function URL (public in TEST)
        },
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
        commands: [
          'set -eu',
          'REV=${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}',
          'REPORT_PREFIX="test-dast/${REV}-$(date +%Y%m%d%H%M%S)"',
          'echo "Target URL: $TARGET_URL"',
          'docker pull owasp/zap2docker-stable',
          'mkdir -p zap',
          'docker run --rm -t -v $(pwd)/zap:/zap/wrk owasp/zap2docker-stable zap-baseline.py ' +
            '-t "$TARGET_URL" ' +
            '-r zap-report.html ' +
            '-J zap-report.json ' +
            '-w zap-warn.md ' +
            '-m 5 -d',

          'aws s3 cp zap "s3://$REPORTS_BUCKET/$REPORT_PREFIX/" --recursive',

          // Fail on Medium/High findings
          'if grep -qi \'"risk":"High"\' zap/zap-report.json || grep -qi \'"risk":"Medium"\' zap/zap-report.json; then ' +
            'echo "DAST found Medium/High alerts. Failing." && exit 1; else echo "DAST clean."; fi',
        ],
        primaryOutputDirectory: 'zap',
      }),

      new ManualApprovalStep('ApproveProdDeploy')
    );
  }
}
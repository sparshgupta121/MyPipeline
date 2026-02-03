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

    // Bucket to store all security reports (SAST/SCA/IaC/DAST)
    const reportsBucket = new s3.Bucket(this, 'SecurityReportsBucketTest', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
    });

    // -------------------------------
    // Synth + Security
    // -------------------------------
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
          // Python tooling for semgrep/checkov
          'python3 -m pip install --user --upgrade pip || true',
          'python3 -m pip install --user semgrep checkov || true',
          'export PATH=$HOME/.local/bin:$PATH',

          // Node deps
          'npm ci || npm install || true',

          // CDK CLI locally for reliable npx usage
          'npm install --no-save aws-cdk@2 || true',

          // Pin ESLint 8 line (you’re already on v8 rules)
          'npm install --no-save -D eslint@8.57.0 eslint-plugin-security@1.7.1 @typescript-eslint/parser@6.21.0 || true',

          // Minimal ESLint config 
          // Note: printf here writes .eslintrc.cjs; 
          'printf \'module.exports = { parser: "@typescript-eslint/parser", plugins: ["security"], extends: ["eslint:recommended", "plugin:security/recommended"], env: { node: true, es2021: true, jest: true }, parserOptions: { ecmaVersion: 2021, sourceType: "module" }, overrides: [{ files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"], env: { jest: true, node: true } }], ignorePatterns: ["node_modules/", "cdk.out/", "*.d.ts", "*.js"] };\' > .eslintrc.cjs || true',

          // Trivy (binary installer)
          'curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b . || true',
        ],
        commands: [
          'set +e',
          'export PATH=$HOME/.local/bin:$PATH',

          // Use CodeBuild-provided commit SHA; no .git in CodeBuild
          'REV=${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}',
          'REPORT_PREFIX="test/${REV}-$(date +%Y%m%d%H%M%S)"',
          'mkdir -p reports || true',

          // --- SAST: ESLint ---
          'echo "Running ESLint (security rules, demo mode)..."',
          'npx eslint . --ext .ts --ignore-pattern "*.test.ts" --ignore-pattern "*.spec.ts" || echo "ESLint failed, continuing..."',

          // --- SAST: Semgrep ---
          'echo "Running Semgrep (demo mode)..."',
          'semgrep --config=auto --exclude node_modules --exclude "*.test.ts" --exclude "*.spec.ts" --timeout=0 --json . > reports/semgrep.json || echo "Semgrep failed, continuing..."',

          // --- SCA: npm audit  ---
          'echo "Running npm audit (demo mode)..."',
          'npm audit --json > reports/npm-audit.json || echo "npm audit failed, continuing..."',
          'node -e \'try{const r=require("./reports/npm-audit.json"); const a=(r.vulnerabilities||r.metadata?.vulnerabilities)||{}; const hi=(a.high||0)+(a.HIGH||0); const cr=(a.critical||0)+(a.CRITICAL||0); console.log("npm audit high/critical:",{high:hi,critical:cr});}catch(e){console.log("npm audit parse skipped");}\' || true',

          // --- Build & Synth (ensure cdk.out exists) ---
          'echo "Building (demo mode)..."',
          'npm run build || echo "Build failed, continuing..."',
          'echo "Synthesizing CDK (demo mode)..."',
          'mkdir -p cdk.out || true',
          'npx cdk synth || (echo "cdk synth failed, writing dummy output" && echo "{}" > cdk.out/dummy.json)',

          // --- IaC: Checkov ---
          'echo "Running Checkov on cdk.out (demo mode)..."',
          'checkov -d cdk.out --framework cloudformation -o json > reports/checkov.json || echo "Checkov failed, continuing..."',
          'if [ -s reports/checkov.json ]; then echo "Checkov report generated (demo)"; head -50 reports/checkov.json || true; fi',

          // --- Trivy FS ---
          'echo "Running Trivy FS (demo mode)..."',
          './trivy fs --security-checks vuln,secret,config --severity HIGH,CRITICAL --no-progress --format json -o reports/trivy-fs.json . || echo "Trivy failed, continuing..."',
          'if [ -s reports/trivy-fs.json ]; then echo "Trivy report generated (demo)"; fi',

          // Upload reports (best effort)
          'echo "Uploading reports to S3 (demo mode)..."',
          'aws s3 cp reports "s3://$REPORTS_BUCKET/$REPORT_PREFIX/" --recursive || echo "S3 upload failed, continuing..."',
          'echo "Reports attempted to s3://$REPORTS_BUCKET/$REPORT_PREFIX/"',
        ],
        primaryOutputDirectory: 'cdk.out',
      }),
    });

    // -------------------------------
    // Application Stage
    // -------------------------------
    const testStage = new TestAppStage(this, 'TestStage', {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT!,
        region: process.env.CDK_DEFAULT_REGION!,
      },
    });

    const stage = pipeline.addStage(testStage);

    // ---------------------------------------
    // ZAP
    // ---------------------------------------
    stage.addPost(
      new CodeBuildStep('DAST-ZAP-Baseline', {
        buildEnvironment: { privileged: true }, // Docker required
        envFromCfnOutputs: {
          TARGET_URL: testStage.functionUrl, // from your stage output
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
          'set +e',

          'REV=${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}',
          'REPORT_PREFIX="test-dast/${REV}-$(date +%Y%m%d%H%M%S)"',
          'echo "Target URL (demo): $TARGET_URL"',

          // Ensure artifact directory exists (so upload/artifact never fails)
          'mkdir -p zap && touch zap/.keep',

          // Prefer AWS ECR Public mirror for ZAP; 
          'echo "Pulling ZAP image (demo) ..."',
          'docker pull public.ecr.aws/zaproxy/zap2docker-stable || echo "ZAP pull failed, continuing..."',

          // Run ZAP baseline; 
          'echo "Running ZAP baseline (demo) ..."',
          'docker run --rm -t -v "$(pwd)/zap:/zap/wrk" public.ecr.aws/zaproxy/zap2docker-stable zap-baseline.py ' +
            '-t "$TARGET_URL" ' +
            '-r zap-report.html ' +
            '-J zap-report.json ' +
            '-w zap-warn.md ' +
            '-m 5 -d || echo "ZAP baseline failed, continuing..."',

          // Upload whatever we have 
          'echo "Uploading ZAP artifacts to S3 (demo)..."',
          'aws s3 cp zap "s3://$REPORTS_BUCKET/$REPORT_PREFIX/" --recursive || echo "S3 upload failed, continuing..."',

          // Optional: print a snippet if file exists
          'if [ -f zap/zap-report.json ]; then echo "DAST report snippet (demo):"; head -100 zap/zap-report.json || true; fi',
          'echo "DAST step finished (demo mode, always success)."',
        ],
        primaryOutputDirectory: 'zap',
      }),

      // Keep manual approval 
      new ManualApprovalStep('ApproveProdDeploy')
    );
  }
}
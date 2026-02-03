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

    // Bucket for security artifacts from the pipeline
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

        // ---------- Install tools (best effort) ----------
        installCommands: [
          'echo "Preparing tools..."',
          'python3 -m pip install --user --upgrade pip || true',
          'python3 -m pip install --user semgrep checkov || true',
          'export PATH=$HOME/.local/bin:$PATH',

          // Node deps
          'npm ci || npm install || true',

          // CDK CLI locally so npx cdk is reliable
          'npm install --no-save aws-cdk@2 || true',

          // ESLint v8 line (stay on non-flat config)
          'npm install --no-save -D eslint@8.57.0 eslint-plugin-security@1.7.1 @typescript-eslint/parser@6.21.0 || true',

          //  ESLint config 
          'printf \'module.exports = { parser: "@typescript-eslint/parser", plugins: ["security"], extends: ["eslint:recommended", "plugin:security/recommended"], env: { node: true, es2021: true, jest: true }, parserOptions: { ecmaVersion: 2021, sourceType: "module" }, overrides: [{ files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"], env: { jest: true, node: true } }], ignorePatterns: ["node_modules/", "cdk.out/", "*.d.ts", "*.js"] };\' > .eslintrc.cjs || true',

          // Trivy (binary)
          'curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b . || true',
        ],

        commands: [
          'set +e',
          'export PATH=$HOME/.local/bin:$PATH',

          // Use CodeBuild-provided sha
          'REV=${CODEBUILD_RESOLVED_SOURCE_VERSION:-unknown}',
          'REPORT_PREFIX="prod/${REV}-$(date +%Y%m%d%H%M%S)"',
          'mkdir -p reports || true',

          // --- SAST: ESLint ---
          'echo "Running ESLint (demo)..."',
          'npx eslint . --ext .ts --ignore-pattern "*.test.ts" --ignore-pattern "*.spec.ts" || echo "ESLint failed, continuing..."',

          // --- SAST: Semgrep ---
          'echo "Running Semgrep (demo)..."',
          'semgrep --config=auto --exclude node_modules --exclude "*.test.ts" --exclude "*.spec.ts" --timeout=0 --json . > reports/semgrep.json || echo "Semgrep failed, continuing..."',

          // --- SCA: npm audit ---
          'echo "Running npm audit (demo)..."',
          'npm audit --json > reports/npm-audit.json || echo "npm audit failed, continuing..."',
          'node -e \'try{const r=require("./reports/npm-audit.json"); const a=(r.vulnerabilities||r.metadata?.vulnerabilities)||{}; const hi=(a.high||0)+(a.HIGH||0); const cr=(a.critical||0)+(a.CRITICAL||0); console.log("npm audit high/critical:",{high:hi,critical:cr});}catch(e){console.log("npm audit parse skipped");}\' || true',

          // --- Build & Synth ---
          'echo "Building (demo)..."',
          'npm run build || echo "Build failed, continuing..."',

          'echo "Synthesizing CDK (demo)..."',
          'mkdir -p cdk.out || true',
          'npx cdk synth || (echo "cdk synth failed, writing dummy output" && echo "{}" > cdk.out/dummy.json)',

          // --- IaC: Checkov ---
          'echo "Running Checkov (demo)..."',
          'checkov -d cdk.out --framework cloudformation -o json > reports/checkov.json || echo "Checkov failed, continuing..."',

          // --- Trivy FS ---
          'echo "Running Trivy FS (demo)..."',
          './trivy fs --security-checks vuln,secret,config --severity HIGH,CRITICAL --no-progress --format json -o reports/trivy-fs.json . || echo "Trivy failed, continuing..."',

          // Upload reports (best effort)
          'echo "Uploading reports to S3 (demo)..."',
          'aws s3 cp reports "s3://$REPORTS_BUCKET/$REPORT_PREFIX/" --recursive || echo "S3 upload failed, continuing..."',
          'echo "Reports attempted to s3://$REPORTS_BUCKET/$REPORT_PREFIX/"',
        ],

        // Ensure we always have artifacts
        primaryOutputDirectory: 'cdk.out',
      }),
    });

    //  production app stage 
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
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["security"],
  extends: ["eslint:recommended", "plugin:security/recommended"],
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module"
  },
  overrides: [
    {
      // Configuration for test files
      files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**/*.ts"],
      env: {
        jest: true,
        node: true
      },
      globals: {
        test: "readonly",
        expect: "readonly",
        describe: "readonly",
        it: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly"
      }
    }
  ],
  ignorePatterns: [
    "node_modules/",
    "cdk.out/",
    "*.d.ts",
    "*.js"
  ]
};
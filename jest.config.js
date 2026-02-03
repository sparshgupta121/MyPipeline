/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // If your tests are under `test/` (CDK default), keep it; if it's `tests/`, change accordingly.
  roots: ['<rootDir>/test', '<rootDir>/lib', '<rootDir>/bin'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    'bin/**/*.ts',
    '!lib/**/*.d.ts',
    '!bin/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
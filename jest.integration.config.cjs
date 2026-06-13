module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.integration.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Require explicit imports from @jest/globals rather than relying on globals
  injectGlobals: false,
  // Run tests serially to avoid DynamoDB table conflicts
  runInBand: true,
  // Integration tests can take longer
  testTimeout: 60000,
  // Verbose output for debugging
  verbose: true,
};

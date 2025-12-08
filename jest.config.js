module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/mocks/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  globals: {
    'ts-jest': {
      tsconfig: {
        // Use the project tsconfig but disable some strict checks for tests
        esModuleInterop: true,
        skipLibCheck: true,
      },
    },
  },
  // Mock VSCode API for tests
  moduleNameMapper: {
    '^vscode$': '<rootDir>/src/__tests__/mocks/vscode.ts',
  },
};

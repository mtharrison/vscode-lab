import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig, getLabCommand, LabTestConfig } from '../src/config';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
    })),
  },
}));

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return default configuration values', () => {
      const config = getConfig();

      expect(config.testMatch).toBe('**/{test,tests,__tests__}/**/*.{js,ts}');
      expect(config.labPath).toBe('');
      expect(config.timeout).toBe(30000);
      expect(config.runPretest).toBe(true);
      expect(config.useNpmTest).toBe('auto');
      expect(config.optimizeTestSpeed).toBe(true);
      expect(config.skipLinting).toBe(true);
      expect(config.skipCoverage).toBe(true);
      expect(config.skipTypeCheck).toBe(true);
    });
  });

  describe('getLabCommand', () => {
    const baseConfig: LabTestConfig = {
      testMatch: '**/test/**/*.js',
      labPath: '',
      timeout: 30000,
      runPretest: true,
      useNpmTest: 'auto',
      optimizeTestSpeed: true,
      skipLinting: true,
      skipCoverage: true,
      skipTypeCheck: true,
    };

    it('should return npx lab when labPath is empty', () => {
      const config: LabTestConfig = { ...baseConfig, labPath: '' };
      expect(getLabCommand(config)).toBe('npx lab');
    });

    it('should return custom labPath when provided', () => {
      const config: LabTestConfig = { ...baseConfig, labPath: '/usr/local/bin/lab' };
      expect(getLabCommand(config)).toBe('/usr/local/bin/lab');
    });

    it('should return relative labPath when provided', () => {
      const config: LabTestConfig = { ...baseConfig, labPath: './node_modules/.bin/lab' };
      expect(getLabCommand(config)).toBe('./node_modules/.bin/lab');
    });
  });
});

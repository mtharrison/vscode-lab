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
    });
  });

  describe('getLabCommand', () => {
    it('should return npx lab when labPath is empty', () => {
      const config: LabTestConfig = {
        testMatch: '**/test/**/*.js',
        labPath: '',
        timeout: 30000,
      };

      expect(getLabCommand(config)).toBe('npx lab');
    });

    it('should return custom labPath when provided', () => {
      const config: LabTestConfig = {
        testMatch: '**/test/**/*.js',
        labPath: '/usr/local/bin/lab',
        timeout: 30000,
      };

      expect(getLabCommand(config)).toBe('/usr/local/bin/lab');
    });

    it('should return relative labPath when provided', () => {
      const config: LabTestConfig = {
        testMatch: '**/test/**/*.js',
        labPath: './node_modules/.bin/lab',
        timeout: 30000,
      };

      expect(getLabCommand(config)).toBe('./node_modules/.bin/lab');
    });
  });
});

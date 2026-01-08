/**
 * @fileoverview Configuration management for the Lab Test Explorer extension
 *
 * Handles reading and parsing VSCode workspace configuration settings
 * for the Lab Test Explorer extension.
 *
 * @module config
 */
import * as vscode from 'vscode';

/**
 * Configuration options for the Lab Test Explorer extension.
 *
 * @property testMatch - Glob pattern for matching test files (e.g., `** /test/** /*.{js,ts}`)
 * @property labPath - Custom path to the lab executable, or empty string to use npx
 * @property timeout - Test execution timeout in milliseconds
 * @property runPretest - Whether to run the pretest script from package.json before tests
 * @property useNpmTest - How to run tests: 'auto' detects based on test script, 'always'/'never' force behavior
 */
export interface LabTestConfig {
  testMatch: string;
  labPath: string;
  timeout: number;
  runPretest: boolean;
  useNpmTest: 'auto' | 'always' | 'never';
}

/**
 * Retrieves the current Lab Test Explorer configuration from VSCode workspace settings.
 *
 * Reads settings from the `labTestExplorer` namespace and provides sensible defaults
 * when settings are not explicitly configured by the user.
 *
 * @returns The current configuration object with all settings populated
 */
export function getConfig(): LabTestConfig {
  const config = vscode.workspace.getConfiguration('labTestExplorer');

  return {
    testMatch: config.get<string>('testMatch', '**/{test,tests,__tests__}/**/*.{js,ts}'),
    labPath: config.get<string>('labPath', ''),
    timeout: config.get<number>('timeout', 30000),
    runPretest: config.get<boolean>('runPretest', true),
    useNpmTest: config.get<'auto' | 'always' | 'never'>('useNpmTest', 'auto'),
  };
}

/**
 * Determines the lab command to use for test execution.
 *
 * Returns the user-configured lab executable path if provided, otherwise
 * falls back to using npx to run lab from the project's node_modules.
 *
 * @param config - The current Lab Test Explorer configuration
 * @returns The command string to use for executing lab tests
 */
export function getLabCommand(config: LabTestConfig): string {
  if (config.labPath) {
    return config.labPath;
  }
  return 'npx lab';
}

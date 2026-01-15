/**
 * @fileoverview Configuration management for the Lab Test Explorer extension
 *
 * Handles reading and parsing VSCode workspace configuration settings
 * for the Lab Test Explorer extension.
 *
 * @module config
 */
import { existsSync } from "fs";
import * as vscode from "vscode";

/**
 * Configuration options for the Lab Test Explorer extension.
 *
 * @property testMatch - Glob pattern for matching test files (e.g., `** /test/** /*.{js,ts}`)
 * @property labPath - Custom path to the lab executable, or empty string to use npx
 * @property timeout - Test execution timeout in milliseconds
 */
export interface LabTestConfig {
  testMatch: string;
  labPath: string;
  timeout: number;
  activationCommand: string;
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
  const config = vscode.workspace.getConfiguration("labTestExplorer");

  return {
    testMatch: config.get<string>(
      "testMatch",
      "**/{test,tests,__tests__}/**/*.{js,ts}"
    ),
    labPath: config.get<string>("labPath", ""),
    timeout: config.get<number>("timeout", 30000),
    activationCommand: config.get<string>("activationCommand", ""),
  };
}

/**
 * Determines the lab command to use for test execution.
 *
 * Returns the user-configured lab executable path if provided, otherwise
 * tries to locate a local installation of lab in the project's node_modules and
 * falls back to using npx to run lab from the project's node_modules.
 *
 * @param config - The current Lab Test Explorer configuration
 * @returns The command string to use for executing lab tests
 */
export function getLabCommand(config: LabTestConfig): string {
  if (config.labPath) {
    return config.labPath;
  }

  // try to use local lab installation
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspacePath = workspaceFolders[0].uri.fsPath;
    const resolvedBin = require.resolve("@hapi/lab/bin/lab", {
      paths: [workspacePath],
    });
    console.log("Resolved local lab path:", resolvedBin);
    if (existsSync(resolvedBin)) {
      return resolvedBin;
    }
  }

  // fallback to npx
  return "npx lab";
}

import * as vscode from 'vscode';

export interface LabTestConfig {
  testMatch: string;
  labPath: string;
  timeout: number;
}

export function getConfig(): LabTestConfig {
  const config = vscode.workspace.getConfiguration('labTestExplorer');

  return {
    testMatch: config.get<string>('testMatch', '**/test/**/*.{js,ts}'),
    labPath: config.get<string>('labPath', ''),
    timeout: config.get<number>('timeout', 30000),
  };
}

export function getLabCommand(config: LabTestConfig): string {
  if (config.labPath) {
    return config.labPath;
  }
  return 'npx lab';
}

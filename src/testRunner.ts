/**
 * @fileoverview Test execution engine for Lab Test Explorer
 *
 * Handles running individual and batch @hapi/lab tests by spawning the lab CLI
 * as a subprocess. Manages test output streaming, result parsing, and
 * cancellation handling.
 *
 * @module testRunner
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getConfig } from './config';
import { escapeRegExp, escapeShellArg } from './testParser';

/**
 * Result of a single test execution.
 *
 * @property passed - Whether the test passed successfully
 * @property duration - Execution time in milliseconds
 * @property message - Error message if the test failed
 * @property output - Full stdout/stderr output from the test
 */
export interface TestResult {
  passed: boolean;
  duration: number;
  message?: string;
  output?: string;
}

/**
 * Executes a single @hapi/lab test case.
 *
 * Spawns `npx lab` (or a custom lab executable if configured) with the appropriate
 * arguments to run only the specified test. Uses the `-g` (grep) flag with an
 * escaped regex pattern to filter to the exact test name.
 *
 * Output is streamed in real-time to VSCode's Test Results panel with ANSI color
 * support. The test result (passed/failed) is reported back to the Test Explorer.
 *
 * @param testItem - The VSCode TestItem representing the test to run
 * @param run - The active test run for reporting results
 * @param token - Cancellation token to support stopping the test mid-execution
 */
export async function runLabTest(
  testItem: vscode.TestItem,
  run: vscode.TestRun,
  token: vscode.CancellationToken
): Promise<void> {
  const config = getConfig();

  const testFilePath = testItem.uri?.fsPath;
  if (!testFilePath) {
    run.failed(testItem, new vscode.TestMessage('Test file path not found'));
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(testItem.uri);
  const cwd = workspaceFolder?.uri.fsPath || path.dirname(testFilePath);

  const testName = testItem.label;
  const escapedName = escapeRegExp(testName);
  const shellSafeName = escapeShellArg(escapedName);

  const args = [
    'lab',
    '-m', config.timeout.toString(),
    '-v',
    '-r', 'console',
    '-g', shellSafeName,
    testFilePath,
  ];

  run.started(testItem);
  const startTime = Date.now();

  return new Promise<void>((resolve) => {
    let output = '';
    let errorOutput = '';

    const proc = spawn('npx', args, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    token.onCancellationRequested(() => {
      proc.kill('SIGTERM');
      run.skipped(testItem);
      resolve();
    });

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      run.appendOutput(text.replace(/\n/g, '\r\n'), undefined, testItem);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      errorOutput += text;
      run.appendOutput(text.replace(/\n/g, '\r\n'), undefined, testItem);
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        run.passed(testItem, duration);
      } else {
        const message = parseErrorMessage(output + errorOutput) || 'Test failed';
        run.failed(testItem, new vscode.TestMessage(message), duration);
      }
      resolve();
    });

    proc.on('error', (err) => {
      run.failed(testItem, new vscode.TestMessage(`Failed to run test: ${err.message}`));
      resolve();
    });
  });
}

function parseErrorMessage(output: string): string | undefined {
  const lines = output.split('\n');
  const errorLines: string[] = [];
  let inError = false;

  for (const line of lines) {
    if (line.includes('Error:') || line.includes('AssertionError')) {
      inError = true;
    }
    if (inError) {
      errorLines.push(line);
      if (errorLines.length >= 10) {
        break;
      }
    }
  }

  return errorLines.length > 0 ? errorLines.join('\n') : undefined;
}

/**
 * Executes multiple tests sequentially.
 *
 * Iterates through all provided test items and runs each one in order.
 * Respects cancellation requests by skipping remaining tests when cancelled.
 *
 * @param testItems - Array of VSCode TestItems to execute
 * @param run - The active test run for reporting results
 * @param token - Cancellation token to support stopping test execution
 */
export async function runAllTests(
  testItems: vscode.TestItem[],
  run: vscode.TestRun,
  token: vscode.CancellationToken
): Promise<void> {
  for (const item of testItems) {
    if (token.isCancellationRequested) {
      run.skipped(item);
      continue;
    }
    await runLabTest(item, run, token);
  }
}

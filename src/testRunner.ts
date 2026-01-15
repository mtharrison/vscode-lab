/**
 * @fileoverview Test execution engine for Lab Test Explorer
 *
 * Handles running individual and batch @hapi/lab tests by spawning the lab CLI
 * as a subprocess. Manages test output streaming, result parsing, and
 * cancellation handling.
 *
 * @module testRunner
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getConfig, getLabCommand } from "./config";
import { buildTestPattern } from "./testParser";

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
 * Reads a script from the target project's package.json.
 *
 * @param cwd - The working directory (project root) to look for package.json
 * @param scriptName - The name of the script to read (e.g., 'test', 'pretest')
 * @returns The script command if found, undefined otherwise
 */
function getPackageScript(cwd: string, scriptName: string): string | undefined {
  const packageJsonPath = path.join(cwd, "package.json");

  try {
    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }

    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8")
    ) as {
      scripts?: Record<string, string>;
    };
    return packageJson.scripts?.[scriptName];
  } catch {
    return undefined;
  }
}

/**
 * Determines whether to use npm test based on config and project setup.
 *
 * @param config - The extension configuration
 * @param cwd - The working directory (project root)
 * @returns true if npm test should be used, false for direct lab invocation
 */
function shouldUseNpmTest(
  config: { useNpmTest: "auto" | "always" | "never" },
  cwd: string
): boolean {
  if (config.useNpmTest === "always") {
    return true;
  }
  if (config.useNpmTest === "never") {
    return false;
  }
  // 'auto': use npm test if a test script exists
  return getPackageScript(cwd, "test") !== undefined;
}

/**
 * Escapes a string for safe use in a shell command.
 * Wraps the string in single quotes and escapes any single quotes within.
 *
 * @param arg - The argument to escape
 * @returns The escaped argument safe for shell execution
 */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export function spawnNpmRun(cwd: string, script: string) {
  const shell = vscode.env.shell || "/bin/zsh";
  const env = { ...process.env, FORCE_COLOR: "1" };

  // zsh: make it login + interactive so it loads .zprofile AND .zshrc
  if (shell.endsWith("zsh")) {
    return spawn(shell, ["-lic", `npm run ${script}`], { cwd, env });
  }

  // bash: often -lc is enough (loads profile); if users put node setup in .bashrc,
  // you may need "-lic" similarly.
  return spawn(shell, ["-lc", `npm run ${script}`], { cwd, env });
}

/**
 * Executes the pretest script from the target project's package.json.
 *
 * Runs the pretest script before lab tests to ensure test setup is complete.
 * Output is streamed to the test run output panel.
 *
 * @param cwd - The working directory to run the script in
 * @param run - The active test run for output streaming
 * @param token - Cancellation token to support stopping the script
 * @returns Promise resolving to true if successful (or no pretest), false if failed
 */
async function runPretestScript(
  cwd: string,
  run: vscode.TestRun,
  token: vscode.CancellationToken
): Promise<boolean> {
  const config = getConfig();

  if (!config.runPretest) {
    return true;
  }

  const pretestScript = getPackageScript(cwd, "pretest");
  if (!pretestScript) {
    return true;
  }

  run.appendOutput(`Running pretest: ${pretestScript}\r\n`);
  run.appendOutput("─".repeat(50) + "\r\n");

  return new Promise<boolean>((resolve) => {
    const proc = spawnNpmRun(cwd, "pretest");

    token.onCancellationRequested(() => {
      proc.kill("SIGTERM");
      resolve(false);
    });

    proc.stdout.on("data", (data: Buffer) => {
      run.appendOutput(data.toString().replace(/\n/g, "\r\n"));
    });

    proc.stderr.on("data", (data: Buffer) => {
      run.appendOutput(data.toString().replace(/\n/g, "\r\n"));
    });

    proc.on("close", (code) => {
      run.appendOutput("─".repeat(50) + "\r\n");
      if (code === 0) {
        run.appendOutput("Pretest completed successfully\r\n\r\n");
        resolve(true);
      } else {
        run.appendOutput(`Pretest failed with exit code ${code}\r\n\r\n`);
        resolve(false);
      }
    });

    proc.on("error", (err) => {
      run.appendOutput(`Pretest error: ${err.message}\r\n`);
      resolve(false);
    });
  });
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
    run.failed(testItem, new vscode.TestMessage("Test file path not found"));
    return;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(testItem.uri);
  const cwd = workspaceFolder?.uri.fsPath || path.dirname(testFilePath);

  const testName = testItem.label;
  // Build a robust pattern that works in both shell and non-shell contexts
  const pattern = buildTestPattern(testName);

  let command: string;
  let args: string[];

  const useNpmTest = shouldUseNpmTest(config, cwd);

  if (useNpmTest) {
    // Run via npm test, passing lab args after --
    // The test script chain (e.g., wolo -> lab) handles timeout/reporter
    // Need shell: true for npm to properly handle the -- separator
    // The pattern is already safe for shell interpretation
    command = "npm";
    args = ["test", "--", "-g", pattern, testFilePath];
  } else {
    // Run lab directly via npx
    // No shell needed - spawn passes args directly to the process
    command = getLabCommand(config);
    args = [
      "-m",
      config.timeout.toString(),
      "-v",
      "-r",
      "console",
      "-g",
      pattern,
      testFilePath,
    ];
  }

  run.started(testItem);
  const startTime = Date.now();

  return new Promise<void>((resolve) => {
    let output = "";
    let errorOutput = "";

    let proc;
    if (useNpmTest) {
      // Run npm through a shell to properly handle the command
      const shell = vscode.env.shell || "/bin/zsh";
      // Escape arguments for safe shell execution
      const escapedArgs = args.map(escapeShellArg).join(" ");
      const cmdString = `${command} ${escapedArgs}`;
      const shellArgs = shell.endsWith("zsh") ? ["-lic", cmdString] : ["-lc", cmdString];
      proc = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, FORCE_COLOR: "1" },
      });
    } else {
      // Run lab directly through Node.js
      // If command is a path to a JS file, use process.execPath
      // If command is "npx lab", split and run npx directly
      if (command.startsWith("npx ")) {
        const [npxCmd, ...npxArgs] = command.split(" ");
        proc = spawn(npxCmd, [...npxArgs, ...args], {
          cwd,
          env: { ...process.env, FORCE_COLOR: "1" },
        });
      } else {
        // Direct path to lab binary
        proc = spawn(process.execPath, [command, ...args], {
          cwd,
          env: { ...process.env, FORCE_COLOR: "1", ELECTRON_RUN_AS_NODE: "1" },
        });
      }
    }

    token.onCancellationRequested(() => {
      proc.kill("SIGTERM");
      run.skipped(testItem);
      resolve();
    });

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      run.appendOutput(text.replace(/\n/g, "\r\n"), undefined, testItem);
    });

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      errorOutput += text;
      run.appendOutput(text.replace(/\n/g, "\r\n"), undefined, testItem);
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        run.passed(testItem, duration);
      } else {
        const message =
          parseErrorMessage(output + errorOutput) || "Test failed";
        run.failed(testItem, new vscode.TestMessage(message), duration);
      }
      resolve();
    });

    proc.on("error", (err) => {
      run.failed(
        testItem,
        new vscode.TestMessage(`Failed to run test: ${err.message}`)
      );
      resolve();
    });
  });
}

function parseErrorMessage(output: string): string | undefined {
  const lines = output.split("\n");
  const errorLines: string[] = [];
  let inError = false;

  for (const line of lines) {
    if (line.includes("Error:") || line.includes("AssertionError")) {
      inError = true;
    }
    if (inError) {
      errorLines.push(line);
      if (errorLines.length >= 10) {
        break;
      }
    }
  }

  return errorLines.length > 0 ? errorLines.join("\n") : undefined;
}

/**
 * Executes multiple tests sequentially.
 *
 * Runs the pretest script (if configured and present) before executing tests.
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
  if (testItems.length === 0) {
    return;
  }

  const config = getConfig();

  // Determine the working directory from the first test item
  const firstItem = testItems[0];
  const workspaceFolder = firstItem.uri
    ? vscode.workspace.getWorkspaceFolder(firstItem.uri)
    : undefined;
  const cwd =
    workspaceFolder?.uri.fsPath ||
    (firstItem.uri ? path.dirname(firstItem.uri.fsPath) : undefined);

  // Run pretest script if available (skip if using npm test since npm handles it)
  const useNpmTest = cwd ? shouldUseNpmTest(config, cwd) : false;
  if (cwd && !useNpmTest) {
    const pretestSuccess = await runPretestScript(cwd, run, token);
    if (!pretestSuccess) {
      // If pretest failed, mark all tests as failed
      for (const item of testItems) {
        run.failed(item, new vscode.TestMessage("Pretest script failed"));
      }
      return;
    }
  }

  for (const item of testItems) {
    if (token.isCancellationRequested) {
      run.skipped(item);
      continue;
    }
    await runLabTest(item, run, token);
  }
}

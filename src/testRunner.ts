/**
 * @fileoverview Test execution engine for hapi/lab Test Runner
 *
 * Handles running individual and batch @hapi/lab tests by spawning the lab CLI
 * as a subprocess. Manages test output streaming, result parsing, and
 * cancellation handling.
 *
 * @module testRunner
 */
import { spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { getConfig, getLabCommand } from "./config";
import { buildTestPattern } from "./testParser";

/**
 * Pattern to parse individual test results from lab output.
 * Captures: [1] pass/fail symbol, [2] test name, [3] duration in ms
 * Matches: "✓ 1) test name (123 ms and 2 assertions)"
 */
const TEST_RESULT_PATTERN = /([✓✔✖✗])\s*\d+\)\s*(.+?)\s*\((\d+)\s*ms/;

/**
 * Pattern to strip ANSI escape codes from output.
 * Lab runs with FORCE_COLOR=1 so output contains color codes.
 */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/g;

/**
 * Pattern to filter out lab's own structural output lines.
 * These lines should not be captured as console output from tests.
 */
const LAB_OUTPUT_FILTER_PATTERN = /^(Test duration:|Leaks:|Failed tests:| {2}\d+\))/;

/**
 * Formats an error message with optional console output prepended.
 * 
 * @param baseMessage - The original error message from the test failure
 * @param consoleOutput - Optional console output to prepend
 * @returns Formatted message with console output (if any) followed by error message
 */
function formatMessageWithConsoleOutput(
  baseMessage: string,
  consoleOutput?: string
): string {
  if (consoleOutput) {
    return `Console output:\n${consoleOutput}\n\n${baseMessage}`;
  }
  return baseMessage;
}

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
 * Executes a single @hapi/lab test case or describe block.
 *
 * Spawns the lab binary (or a custom lab executable if configured) with the appropriate
 * arguments to run only the specified test. Uses the `-g` (grep) flag with an
 * escaped regex pattern to filter to the exact test name.
 *
 * Output is streamed in real-time to VSCode's Test Results panel with ANSI color
 * support. The test result (passed/failed) is reported back to the Test Explorer.
 *
 * @param testItem - The VSCode TestItem representing the test to run
 * @param run - The active test run for reporting results
 * @param token - Cancellation token to support stopping the test mid-execution
 * @param descendants - Optional array of descendant items to mark with the same result
 */
export async function runLabTest(
  testItem: vscode.TestItem,
  run: vscode.TestRun,
  token: vscode.CancellationToken,
  descendants?: vscode.TestItem[]
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
  const pattern = buildTestPattern(testName);

  const command = getLabCommand(config);
  const labArgs = config.labArgs.split(/\s+/).filter((arg) => arg.length > 0);
  const args = [
    "-m",
    config.timeout.toString(),
    ...labArgs,
    "-g",
    pattern,
    testFilePath,
  ];

  run.started(testItem);
  const startTime = Date.now();

  return new Promise<void>((resolve) => {
    let output = "";
    let errorOutput = "";

    // State for real-time test result tracking
    const descendantMap = new Map<string, vscode.TestItem>();
    const markedDescendants = new Set<vscode.TestItem>();
    const failedDescendants = new Map<vscode.TestItem, number>(); // TestItem -> duration
    const consoleOutputPerTest = new Map<vscode.TestItem, string>(); // TestItem -> console output
    let lineBuffer = "";
    let consoleBuffer: string[] = []; // Buffer for console output before a test result

    if (descendants) {
      for (const d of descendants) {
        descendantMap.set(d.label, d);
      }
    }

    let proc;
    const commandPrefix = config.commandPrefix;

    if (commandPrefix) {
      // Add node_modules/.bin to PATH for local binaries
      const binPath = path.join(cwd, "node_modules", ".bin");
      const env = {
        ...process.env,
        FORCE_COLOR: "1",
        PATH: `${binPath}${path.delimiter}${process.env.PATH}`,
      };

      // Quote arguments to prevent shell interpretation issues
      const quotedArgs = args
        .map((arg) => `'${arg.replace(/'/g, "'\\''")}'`)
        .join(" ");
      const fullCommand = `${commandPrefix} ${command} ${quotedArgs}`;

      proc = spawn(fullCommand, [], {
        cwd,
        env,
        shell: true,
      });
    } else if (command.startsWith("npx ")) {
      // Run lab via npx
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

    token.onCancellationRequested(() => {
      proc.kill("SIGTERM");
      run.skipped(testItem);
      resolve();
    });

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      run.appendOutput(text.replace(/\n/g, "\r\n"), undefined, testItem);

      // Parse for individual test results in real-time
      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      // Keep last incomplete line in buffer
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        const cleanLine = line.replace(ANSI_ESCAPE_PATTERN, "");
        const match = TEST_RESULT_PATTERN.exec(cleanLine);
        
        if (match && descendants && descendants.length > 0) {
          const [, symbol, testName, durationStr] = match;
          const descendant = descendantMap.get(testName.trim());
          if (descendant && !markedDescendants.has(descendant)) {
            const duration = parseInt(durationStr, 10);
            
            // Save any accumulated console output for this test
            // Lab runs tests sequentially, so console output before a test result
            // belongs to that test. The extension also runs lab once per test/describe.
            if (consoleBuffer.length > 0) {
              consoleOutputPerTest.set(descendant, consoleBuffer.join("\n"));
              consoleBuffer = []; // Clear buffer for next test
            }
            
            if (symbol === "✓" || symbol === "✔") {
              markedDescendants.add(descendant);
              run.passed(descendant, duration);
            } else {
              // Store failed tests to mark in close handler with actual error message
              failedDescendants.set(descendant, duration);
            }
          }
        } else if (!TEST_RESULT_PATTERN.test(cleanLine) && cleanLine.trim()) {
          // This is not a test result line and not empty - might be console output
          // Only buffer if it's not part of lab's output structure
          if (!LAB_OUTPUT_FILTER_PATTERN.test(cleanLine)) {
            consoleBuffer.push(line);
          }
        }
      }
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
        // Mark any descendants not already marked in real-time
        if (descendants) {
          for (const descendant of descendants) {
            if (!markedDescendants.has(descendant)) {
              run.passed(descendant, duration);
            }
          }
        }
      } else {
        const baseMessage =
          parseErrorMessage(output + errorOutput) || "Test failed";
        
        // For single test (no descendants), include console output in main error message
        const mainConsoleOutput = (!descendants || descendants.length === 0) && consoleBuffer.length > 0
          ? consoleBuffer.join("\n")
          : undefined;
        const mainMessage = formatMessageWithConsoleOutput(baseMessage, mainConsoleOutput);
        
        run.failed(testItem, new vscode.TestMessage(mainMessage), duration);
        
        // Mark failed descendants detected in real-time with actual error message
        for (const [descendant, descendantDuration] of failedDescendants) {
          markedDescendants.add(descendant);
          
          // Include console output in the error message for this specific test
          const consoleOutput = consoleOutputPerTest.get(descendant);
          const errorMessage = formatMessageWithConsoleOutput(baseMessage, consoleOutput);
          
          run.failed(descendant, new vscode.TestMessage(errorMessage), descendantDuration);
        }
        // Mark remaining descendants as failed
        if (descendants) {
          for (const descendant of descendants) {
            if (!markedDescendants.has(descendant)) {
              run.failed(descendant, new vscode.TestMessage(baseMessage), duration);
            }
          }
        }
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

/**
 * Pattern to detect lab's numbered failure output.
 * Matches: "  1) Test name:" at the start of failure details
 */
const FAILURE_START_PATTERN = /^\s*\d+\)\s+.+:/;

function parseErrorMessage(output: string): string | undefined {
  // Strip ANSI escape codes for cleaner parsing
  const cleanOutput = output.replace(ANSI_ESCAPE_PATTERN, "");
  const lines = cleanOutput.split("\n");
  const errorLines: string[] = [];
  let inError = false;

  for (const line of lines) {
    // Start capturing on lab's numbered failure format or error keywords
    if (
      !inError &&
      (FAILURE_START_PATTERN.test(line) ||
        line.includes("Error:") ||
        line.includes("AssertionError"))
    ) {
      inError = true;
    }

    if (inError) {
      errorLines.push(line);
      // Capture up to 20 lines for more context
      if (errorLines.length >= 20) {
        break;
      }
    }
  }

  // Trim trailing empty lines
  while (errorLines.length > 0 && errorLines[errorLines.length - 1].trim() === "") {
    errorLines.pop();
  }

  return errorLines.length > 0 ? errorLines.join("\n") : undefined;
}

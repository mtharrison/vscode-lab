/**
 * @fileoverview Main test controller for hapi/lab Test Runner
 *
 * Implements VSCode's TestController API to provide native Test Explorer integration.
 * Handles test discovery, file watching, and test execution orchestration for
 * @hapi/lab test files.
 *
 * @module testController
 */
import * as path from "path";
import * as vscode from "vscode";
import { getConfig } from "./config";
import { ParsedTest, parseTestFile } from "./testParser";
import { runLabTest } from "./testRunner";

/**
 * Controller for integrating @hapi/lab tests with VSCode's Test Explorer.
 *
 * This class is the core of the extension, responsible for:
 * - Creating and managing the VSCode TestController instance
 * - Discovering tests in the workspace using configurable glob patterns
 * - Watching for file changes to keep tests in sync
 * - Handling test run requests from the Test Explorer UI
 * - Displaying test items with gutter icons for inline test execution
 */
export class LabTestController {
  private controller: vscode.TestController;
  private testItemMap: WeakMap<vscode.TestItem, ParsedTest> = new WeakMap();
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.controller = vscode.tests.createTestController(
      "labTestController",
      "Lab Tests"
    );

    this.controller.resolveHandler = async (item) => {
      if (!item) {
        await this.discoverAllTests();
      } else if (item.uri) {
        await this.parseTestsInFile(item.uri);
      }
    };

    this.controller.refreshHandler = async () => {
      await this.discoverAllTests();
    };

    const runProfile = this.controller.createRunProfile(
      "Run",
      vscode.TestRunProfileKind.Run,
      async (request, token) => {
        await this.runTests(request, token);
      },
      true
    );

    this.disposables.push(runProfile);
    this.setupFileWatcher();
    this.setupDocumentWatchers();

    // Parse all currently open test files
    this.parseOpenDocuments();

    // Discover all tests in workspace
    void this.discoverAllTests();
  }

  private setupFileWatcher(): void {
    const config = getConfig();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return;
    }

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, config.testMatch)
    );

    this.fileWatcher.onDidCreate((uri) => void this.parseTestsInFile(uri));
    this.fileWatcher.onDidChange((uri) => void this.parseTestsInFile(uri));
    this.fileWatcher.onDidDelete((uri) => this.removeTestsForFile(uri));

    this.disposables.push(this.fileWatcher);
  }

  private setupDocumentWatchers(): void {
    // Watch for document opens
    const openWatcher = vscode.workspace.onDidOpenTextDocument((document) => {
      if (this.isTestFile(document.uri) && document.uri.scheme === "file") {
        this.parseTestsInDocument(document);
      }
    });
    this.disposables.push(openWatcher);

    // Watch for document changes
    const changeWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
      if (this.isTestFile(e.document.uri) && e.document.uri.scheme === "file") {
        this.parseTestsInDocument(e.document);
      }
    });
    this.disposables.push(changeWatcher);

    // Watch for document saves (re-parse to ensure consistency)
    const saveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
      if (this.isTestFile(document.uri) && document.uri.scheme === "file") {
        this.parseTestsInDocument(document);
      }
    });
    this.disposables.push(saveWatcher);
  }

  private parseOpenDocuments(): void {
    // Parse all currently open text documents that are test files
    for (const document of vscode.workspace.textDocuments) {
      if (this.isTestFile(document.uri) && document.uri.scheme === "file") {
        this.parseTestsInDocument(document);
      }
    }
  }

  private isTestFile(uri: vscode.Uri): boolean {
    if (uri.scheme !== "file") {
      return false;
    }

    const config = getConfig();
    const relativePath = vscode.workspace.asRelativePath(uri);

    // Convert glob pattern to regex
    const pattern = new RegExp(
      "^" +
        config.testMatch
          .replace(/\./g, "\\.")
          .replace(/\*\*/g, "<<GLOBSTAR>>")
          .replace(/\*/g, "[^/]*")
          .replace(/<<GLOBSTAR>>/g, ".*")
          .replace(/\{([^}]+)\}/g, "($1)")
          .replace(/,/g, "|") +
        "$"
    );

    return pattern.test(relativePath);
  }

  /**
   * Discovers all test files in the workspace and parses them for tests.
   *
   * Searches for files matching the configured `testMatch` glob pattern,
   * excluding `node_modules`. Each discovered file is parsed to extract
   * test definitions which are then displayed in the Test Explorer.
   *
   * This method is called automatically on extension activation and can
   * be triggered manually via the "hapi/lab Test Runner: Refresh" command.
   */
  async discoverAllTests(): Promise<void> {
    const config = getConfig();

    const testFiles = await vscode.workspace.findFiles(
      config.testMatch,
      "**/node_modules/**"
    );

    for (const uri of testFiles) {
      await this.parseTestsInFile(uri);
    }
  }

  private async parseTestsInFile(uri: vscode.Uri): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      this.parseTestsInDocument(document);
    } catch (error) {
      console.error(`Failed to parse test file ${uri.fsPath}:`, error);
    }
  }

  private parseTestsInDocument(document: vscode.TextDocument): void {
    const uri = document.uri;
    const content = document.getText();
    const tests = parseTestFile(content);

    if (tests.length === 0) {
      // No tests found, remove any existing items for this file
      this.removeTestsForFile(uri);
      return;
    }

    const fileId = uri.toString();
    const existingItem = this.controller.items.get(fileId);

    // Clear existing children recursively
    if (existingItem) {
      this.clearChildrenRecursive(existingItem);
    }

    const fileName = path.basename(uri.fsPath);
    const fileItem =
      existingItem || this.controller.createTestItem(fileId, fileName, uri);
    fileItem.canResolveChildren = false;

    if (!existingItem) {
      this.controller.items.add(fileItem);
    }

    // Recursively add tests with hierarchy
    this.addTestItems(fileItem, tests, uri);
  }

  /**
   * Recursively clears all children from a test item.
   */
  private clearChildrenRecursive(item: vscode.TestItem): void {
    item.children.forEach((child) => {
      this.clearChildrenRecursive(child);
      item.children.delete(child.id);
    });
  }

  /**
   * Recursively adds test items to a parent, creating nested hierarchy for describe/experiment blocks.
   */
  private addTestItems(
    parent: vscode.TestItem,
    tests: ParsedTest[],
    uri: vscode.Uri
  ): void {
    for (const test of tests) {
      const testId = `${parent.id}#${test.name}`;
      const testItem = this.controller.createTestItem(testId, test.name, uri);

      // Set the range - this is what makes the gutter icons appear
      testItem.range = test.range;
      testItem.canResolveChildren = false;

      // Lock in source code order using line number to prevent VS Code from reordering by status
      testItem.sortText = test.range.start.line.toString().padStart(6, "0");

      // Add visual indicator for .only and .skip modifiers
      if (test.modifier === 'only') {
        testItem.tags = [new vscode.TestTag('only')];
        testItem.description = '(only)';
      } else if (test.modifier === 'skip') {
        testItem.tags = [new vscode.TestTag('skip')];
        testItem.description = '(skip)';
      }

      this.testItemMap.set(testItem, test);
      parent.children.add(testItem);

      // Recursively add children for describe/experiment blocks
      if (test.children.length > 0) {
        this.addTestItems(testItem, test.children, uri);
      }
    }
  }

  private removeTestsForFile(uri: vscode.Uri): void {
    const fileId = uri.toString();
    this.controller.items.delete(fileId);
  }

  private async runTests(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ): Promise<void> {
    const run = this.controller.createTestRun(request);

    // Get the directly selected items (or all top-level items if none selected)
    const selectedItems: vscode.TestItem[] = [];
    if (request.include) {
      for (const item of request.include) {
        selectedItems.push(item);
      }
    } else {
      this.controller.items.forEach((item) => {
        selectedItems.push(item);
      });
    }

    // Build exclude set
    const excludeIds = new Set(request.exclude?.map((e) => e.id) || []);

    // Process each selected item
    for (const item of selectedItems) {
      if (token.isCancellationRequested) {
        break;
      }

      if (excludeIds.has(item.id)) {
        continue;
      }

      await this.runTestItem(item, run, token, excludeIds);
    }

    run.end();
  }

  /**
   * Runs a single test item. For describe/experiment blocks (items with children),
   * runs lab once with the describe pattern. For leaf tests, runs the individual test.
   */
  private async runTestItem(
    item: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken,
    excludeIds: Set<string>
  ): Promise<void> {
    if (token.isCancellationRequested) {
      run.skipped(item);
      return;
    }

    // Check if this test has a .skip modifier - if so, skip it without running
    const parsedTest = this.testItemMap.get(item);
    if (parsedTest?.modifier === 'skip') {
      run.skipped(item);
      // If it's a container (describe/experiment), skip all children too
      if (item.children.size > 0) {
        this.skipAllDescendants(item, run);
      }
      return;
    }

    // Check if this is a file item (no parent test, just contains tests)
    const isFileItem = !item.id.includes("#");

    if (isFileItem) {
      // For file items, run each child
      for (const [, child] of item.children) {
        if (!excludeIds.has(child.id)) {
          await this.runTestItem(child, run, token, excludeIds);
        }
      }
    } else if (item.children.size > 0) {
      // This is a describe/experiment block - run it as a single lab invocation
      await this.runDescribeBlock(item, run, token);
    } else {
      // This is a leaf test - run it individually
      await runLabTest(item, run, token);
    }
  }

  /**
   * Runs a describe/experiment block as a single lab invocation.
   * Marks all descendant tests based on the result.
   */
  private async runDescribeBlock(
    item: vscode.TestItem,
    run: vscode.TestRun,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Collect all descendants to mark with the same result
    const descendants: vscode.TestItem[] = [];
    this.collectDescendants(item, descendants);

    // Mark all descendants as started
    for (const descendant of descendants) {
      run.started(descendant);
    }

    // Run the describe block - lab will match all tests under this pattern
    // The runLabTest will mark both the item and all descendants with the result
    await runLabTest(item, run, token, descendants);
  }

  /**
   * Collects all descendant test items recursively.
   */
  private collectDescendants(
    item: vscode.TestItem,
    collected: vscode.TestItem[]
  ): void {
    for (const [, child] of item.children) {
      collected.push(child);
      this.collectDescendants(child, collected);
    }
  }

  /**
   * Marks all descendant test items as skipped.
   */
  private skipAllDescendants(
    item: vscode.TestItem,
    run: vscode.TestRun
  ): void {
    for (const [, child] of item.children) {
      run.skipped(child);
      if (child.children.size > 0) {
        this.skipAllDescendants(child, run);
      }
    }
  }

  private collectTestItems(
    item: vscode.TestItem,
    collected: vscode.TestItem[]
  ): void {
    collected.push(item);
    item.children.forEach((child) => {
      this.collectTestItems(child, collected);
    });
  }

  /**
   * Disposes of all resources held by the controller.
   *
   * Cleans up the VSCode TestController, file watchers, and all other
   * registered disposables. Should be called when the extension is
   * deactivated to prevent resource leaks.
   */
  dispose(): void {
    this.controller.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

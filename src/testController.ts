/**
 * @fileoverview Main test controller for Lab Test Explorer
 *
 * Implements VSCode's TestController API to provide native Test Explorer integration.
 * Handles test discovery, file watching, and test execution orchestration for
 * @hapi/lab test files.
 *
 * @module testController
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig } from './config';
import { parseTestFile, ParsedTest } from './testParser';
import { runAllTests } from './testRunner';

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
      'labTestController',
      'Lab Tests'
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
      'Run',
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
      if (this.isTestFile(document.uri) && document.uri.scheme === 'file') {
        this.parseTestsInDocument(document);
      }
    });
    this.disposables.push(openWatcher);

    // Watch for document changes
    const changeWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
      if (this.isTestFile(e.document.uri) && e.document.uri.scheme === 'file') {
        this.parseTestsInDocument(e.document);
      }
    });
    this.disposables.push(changeWatcher);

    // Watch for document saves (re-parse to ensure consistency)
    const saveWatcher = vscode.workspace.onDidSaveTextDocument((document) => {
      if (this.isTestFile(document.uri) && document.uri.scheme === 'file') {
        this.parseTestsInDocument(document);
      }
    });
    this.disposables.push(saveWatcher);
  }

  private parseOpenDocuments(): void {
    // Parse all currently open text documents that are test files
    for (const document of vscode.workspace.textDocuments) {
      if (this.isTestFile(document.uri) && document.uri.scheme === 'file') {
        this.parseTestsInDocument(document);
      }
    }
  }

  private isTestFile(uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file') {
      return false;
    }

    const config = getConfig();
    const relativePath = vscode.workspace.asRelativePath(uri);

    // Convert glob pattern to regex
    const pattern = new RegExp(
      '^' + config.testMatch
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '<<GLOBSTAR>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<GLOBSTAR>>/g, '.*')
        .replace(/\{([^}]+)\}/g, '($1)')
        .replace(/,/g, '|') + '$'
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
   * be triggered manually via the "Lab Test Explorer: Refresh" command.
   */
  async discoverAllTests(): Promise<void> {
    const config = getConfig();

    const testFiles = await vscode.workspace.findFiles(
      config.testMatch,
      '**/node_modules/**'
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

    // Clear existing children
    if (existingItem) {
      existingItem.children.forEach((child) => {
        existingItem.children.delete(child.id);
      });
    }

    const fileName = path.basename(uri.fsPath);
    const fileItem = existingItem || this.controller.createTestItem(fileId, fileName, uri);
    fileItem.canResolveChildren = false;

    if (!existingItem) {
      this.controller.items.add(fileItem);
    }

    for (const test of tests) {
      const testId = `${fileId}#${test.name}`;
      const testItem = this.controller.createTestItem(testId, test.name, uri);

      // Set the range - this is what makes the gutter icons appear
      testItem.range = test.range;
      testItem.canResolveChildren = false;

      this.testItemMap.set(testItem, test);
      fileItem.children.add(testItem);
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
    const testItems: vscode.TestItem[] = [];

    if (request.include) {
      for (const item of request.include) {
        this.collectTestItems(item, testItems);
      }
    } else {
      this.controller.items.forEach((item) => {
        this.collectTestItems(item, testItems);
      });
    }

    if (request.exclude) {
      const excludeIds = new Set(request.exclude.map((e) => e.id));
      const filteredItems = testItems.filter((item) => !excludeIds.has(item.id));
      testItems.length = 0;
      testItems.push(...filteredItems);
    }

    // Only run leaf tests (actual test cases, not files/suites)
    const leafTests = testItems.filter((item) => item.children.size === 0);

    await runAllTests(leafTests, run, token);
    run.end();
  }

  private collectTestItems(item: vscode.TestItem, collected: vscode.TestItem[]): void {
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

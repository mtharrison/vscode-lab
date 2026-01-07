import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig } from './config';
import { parseTestFile, ParsedTest } from './testParser';
import { runAllTests } from './testRunner';

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
    this.setupDocumentWatcher();
  }

  private setupFileWatcher(): void {
    const config = getConfig();
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.workspace.workspaceFolders?.[0] || '',
        config.testMatch
      )
    );

    this.fileWatcher.onDidCreate((uri) => this.parseTestsInFile(uri));
    this.fileWatcher.onDidChange((uri) => this.parseTestsInFile(uri));
    this.fileWatcher.onDidDelete((uri) => this.removeTestsForFile(uri));

    this.disposables.push(this.fileWatcher);
  }

  private setupDocumentWatcher(): void {
    const documentWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
      if (this.isTestFile(e.document.uri)) {
        this.parseTestsInDocument(e.document);
      }
    });
    this.disposables.push(documentWatcher);
  }

  private isTestFile(uri: vscode.Uri): boolean {
    const config = getConfig();
    const relativePath = vscode.workspace.asRelativePath(uri);
    const pattern = new RegExp(
      config.testMatch
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\./g, '\\.')
        .replace(/\{([^}]+)\}/g, '($1)')
        .replace(/,/g, '|')
    );
    return pattern.test(relativePath);
  }

  async discoverAllTests(): Promise<void> {
    const config = getConfig();

    this.controller.items.forEach((item) => {
      this.controller.items.delete(item.id);
    });

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

    const fileId = uri.toString();
    const existingItem = this.controller.items.get(fileId);
    if (existingItem) {
      existingItem.children.forEach((child) => {
        existingItem.children.delete(child.id);
      });
    }

    const fileName = path.basename(uri.fsPath);
    const fileItem =
      existingItem ||
      this.controller.createTestItem(fileId, fileName, uri);

    if (!existingItem) {
      this.controller.items.add(fileItem);
    }

    for (const test of tests) {
      const testId = `${fileId}#${test.name}`;
      const testItem = this.controller.createTestItem(
        testId,
        test.name,
        uri
      );
      testItem.range = test.range;

      testItem.tags = [new vscode.TestTag(test.type)];
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

  dispose(): void {
    this.controller.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

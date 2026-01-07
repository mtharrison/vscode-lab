export class Range {
  constructor(
    public startLine: number,
    public startCharacter: number,
    public endLine: number,
    public endCharacter: number
  ) {}
}

export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}
}

export class Uri {
  static file(path: string): Uri {
    return new Uri(path);
  }

  static parse(value: string): Uri {
    return new Uri(value);
  }

  constructor(public fsPath: string) {}

  toString(): string {
    return `file://${this.fsPath}`;
  }
}

export class TestMessage {
  constructor(public message: string) {}
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class TestTag {
  constructor(public id: string) {}
}

export const workspace = {
  getConfiguration: () => ({
    get: <T>(key: string, defaultValue: T): T => defaultValue,
  }),
  workspaceFolders: [],
  findFiles: async () => [],
  openTextDocument: async () => ({
    getText: () => '',
    uri: Uri.file('/test.js'),
  }),
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  asRelativePath: (uri: Uri) => uri.fsPath,
};

export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string
  ) {}
}

export const window = {
  createTerminal: () => ({
    sendText: () => {},
    show: () => {},
    dispose: () => {},
  }),
  onDidCloseTerminal: () => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
};

export const tests = {
  createTestController: () => ({
    items: {
      add: () => {},
      delete: () => {},
      get: () => undefined,
      forEach: () => {},
    },
    createTestItem: (id: string, label: string, uri?: Uri) => ({
      id,
      label,
      uri,
      children: {
        add: () => {},
        delete: () => {},
        forEach: () => {},
        size: 0,
      },
      range: undefined,
      tags: [],
    }),
    createRunProfile: () => ({ dispose: () => {} }),
    createTestRun: () => ({
      started: () => {},
      passed: () => {},
      failed: () => {},
      skipped: () => {},
      appendOutput: () => {},
      end: () => {},
    }),
    dispose: () => {},
    resolveHandler: undefined,
    refreshHandler: undefined,
  }),
};

export enum TestRunProfileKind {
  Run = 1,
  Debug = 2,
  Coverage = 3,
}

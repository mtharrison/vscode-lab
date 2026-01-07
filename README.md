# Lab Test Explorer for VS Code

Run and debug [hapijs/lab](https://hapi.dev/module/lab/) tests directly from VS Code's Test Explorer with full integration.

## Features

- **Native Test Explorer Integration**: Tests appear in VS Code's Test Explorer sidebar with green play arrows
- **Run Individual Tests**: Click the play button next to any test to run it
- **Run All Tests**: Run entire test files or all tests at once
- **Live Results**: See test pass/fail status directly in the editor
- **Test Output**: View detailed test output in the Test Results panel

## Requirements

- Node.js 18 or later
- VS Code 1.85.0 or later
- A project using `@hapi/lab` or `lab` for testing

## Installation

Search for "Lab Test Explorer" in the VS Code Extensions marketplace, or install from the command line:

```bash
code --install-extension mtharrison.vscode-lab
```

## Configuration

Configure the extension through VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `labTestExplorer.testMatch` | `**/test/**/*.{js,ts}` | Glob pattern to match test files |
| `labTestExplorer.labPath` | `""` | Path to lab executable (leave empty to use npx) |
| `labTestExplorer.timeout` | `30000` | Test timeout in milliseconds |

## Usage

1. Open a project that uses `@hapi/lab` for testing
2. Open the Test Explorer in the sidebar (beaker icon)
3. Your tests will be automatically discovered
4. Click the play button next to any test to run it

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test

# Lint code
npm run lint
```

## License

BSD-3-Clause

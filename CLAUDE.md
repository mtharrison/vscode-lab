# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VS Code extension that integrates `@hapi/lab` testing framework with VS Code's native Test Explorer. Allows running/debugging hapi/lab tests directly from the IDE with visual feedback and gutter icons.

## Development Commands

```bash
npm install              # Install dependencies
npm run compile          # One-time build (esbuild)
npm run watch            # Watch mode for development
npm test                 # Run all tests (runs tsc --noEmit first)
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Coverage report
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm run package          # Production build (minified)
npm run vsce:package     # Create .vsix for distribution
```

### Running Individual Tests

```bash
npm test -- test/config.test.ts           # Run specific test file
npm test -- -t "pattern"                  # Run tests matching pattern
npm run test:watch -- test/config.test.ts # Watch specific file
```

## Architecture

```
src/
├── extension.ts      # Entry point: activation, lab dependency detection
├── config.ts         # Reads labTestExplorer.* settings, resolves lab path
├── testController.ts # Core VS Code TestController, file watching, test discovery
├── testParser.ts     # AST parsing with typescript-estree, extracts test names/locations
└── testRunner.ts     # Spawns lab subprocess, streams output, parses results
```

### Data Flow

1. **Activation** (`extension.ts`): Checks if workspace has `@hapi/lab` dependency, creates TestController
2. **Discovery** (`testController.ts` → `testParser.ts`): Watches files matching glob pattern, parses AST to find `test()`/`it()`/`describe()`/`experiment()` calls
3. **Execution** (`testRunner.ts`): Spawns lab CLI with grep pattern, streams ANSI output to Test Results panel, parses pass/fail in real-time

### Key Implementation Details

**Test pattern building** (`testParser.ts:buildTestPattern`): Converts test names to safe grep patterns by replacing special characters with `.` (regex wildcard). This handles shell escaping across multiple layers (npm → wrapper → lab).

**Test item IDs**: `file:///path/to/file.ts#describe name#test name` - use `#` presence to detect file vs test items.

**Execution modes** (`testRunner.ts`):
- Custom path: `spawn(process.execPath, [labPath, ...args])`
- npx fallback: `spawn('npx', ['lab', ...args])`
- Command prefix: `spawn(fullCommand, [], { shell: true })`

**Real-time result parsing**: Matches pattern `[✓✔✖✗] \d+) testName (duration ms` in lab output while running.

## Testing Setup

- **Framework**: Vitest with globals enabled
- **VS Code mocks**: `test/__mocks__/vscode.ts` provides complete API mock
- **Coverage**: v8 provider, excludes `extension.ts` (hard to unit test)

## Configuration Settings

All under `labTestExplorer.*` namespace:
- `testMatch`: Glob for test files (default: `**/{test,tests,__tests__}/**/*.{js,ts}`)
- `labPath`: Custom lab executable path (empty = use npx)
- `timeout`: Test timeout in ms (default: 30000)
- `labArgs`: CLI args passed to lab
- `commandPrefix`: Prefix for test command (e.g., `NODE_ENV=test`)
- `suppressPrefixOutput`: Hide wrapper output, show only lab results

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as vscode from 'vscode';

export interface ParsedTest {
  name: string;
  type: 'describe' | 'it' | 'experiment' | 'test';
  range: vscode.Range;
  children: ParsedTest[];
}

interface AcornNode {
  type: string;
  loc?: acorn.SourceLocation;
  callee?: AcornNode;
  name?: string;
  arguments?: AcornNode[];
  value?: string | number | boolean | null | RegExp | bigint;
  raw?: string;
}

const TEST_FUNCTIONS = new Set(['describe', 'it', 'experiment', 'test']);

export function parseTestFile(content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];

  try {
    const ast = acorn.parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowHashBang: true,
    });

    walk.simple(ast, {
      CallExpression(node: acorn.Node) {
        const callNode = node as unknown as AcornNode;
        if (
          callNode.callee?.type === 'Identifier' &&
          callNode.callee.name &&
          TEST_FUNCTIONS.has(callNode.callee.name) &&
          callNode.arguments &&
          callNode.arguments.length >= 2 &&
          (callNode.arguments[0].type === 'Literal' || callNode.arguments[0].type === 'TemplateLiteral') &&
          callNode.loc
        ) {
          const firstArg = callNode.arguments[0];
          const testName = (typeof firstArg.value === 'string' ? firstArg.value : null) ||
            (firstArg.raw ? firstArg.raw.slice(1, -1) : 'unnamed test');

          const range = new vscode.Range(
            callNode.loc.start.line - 1,
            callNode.loc.start.column,
            callNode.loc.end.line - 1,
            callNode.loc.end.column
          );

          const testType = callNode.callee.name as ParsedTest['type'];

          tests.push({
            name: testName,
            type: testType,
            range,
            children: [],
          });
        }
      },
    });
  } catch {
    // Failed to parse - return empty tests array
  }

  return tests;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

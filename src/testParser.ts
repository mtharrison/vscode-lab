import { parse, simpleTraverse, AST_NODE_TYPES, TSESTree } from '@typescript-eslint/typescript-estree';
import * as vscode from 'vscode';

export interface ParsedTest {
  name: string;
  type: 'describe' | 'it' | 'experiment' | 'test';
  range: vscode.Range;
  children: ParsedTest[];
}

const TEST_FUNCTIONS = new Set(['describe', 'it', 'experiment', 'test']);

export function parseTestFile(content: string): ParsedTest[] {
  const tests: ParsedTest[] = [];

  try {
    const ast = parse(content, {
      loc: true,
      range: true,
      jsx: true,
    });

    simpleTraverse(ast, {
      enter(node) {
        if (node.type === AST_NODE_TYPES.CallExpression) {
          const callNode = node;
          if (
            callNode.callee.type === AST_NODE_TYPES.Identifier &&
            TEST_FUNCTIONS.has(callNode.callee.name) &&
            callNode.arguments.length >= 2 &&
            (callNode.arguments[0].type === AST_NODE_TYPES.Literal || callNode.arguments[0].type === AST_NODE_TYPES.TemplateLiteral) &&
            callNode.loc
          ) {
            const firstArg = callNode.arguments[0];
            let testName = 'unnamed test';

            if (firstArg.type === AST_NODE_TYPES.Literal && typeof (firstArg as TSESTree.Literal).value === 'string') {
              testName = (firstArg as TSESTree.Literal).value as string;
            } else if (firstArg.type === AST_NODE_TYPES.TemplateLiteral && (firstArg).quasis.length > 0) {
              testName = (firstArg).quasis.map((q) => q.value.cooked || q.value.raw).join('');
            }

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

/**
 * Escapes a string for safe use as a shell argument.
 * Uses single quotes and escapes any embedded single quotes.
 */
export function escapeShellArg(text: string): string {
  // Wrap in single quotes and escape any embedded single quotes
  // by ending the single-quoted string, adding an escaped single quote, and restarting
  return `'${text.replace(/'/g, "'\\''")}'`;
}

/**
 * @fileoverview Test file parser for Lab Test Explorer
 *
 * Uses AST parsing to detect test functions (`test()`, `it()`, `describe()`, `experiment()`)
 * in JavaScript and TypeScript files. Extracts test names and source locations for
 * integration with VSCode's Test Explorer.
 *
 * @module testParser
 */
import { parse, simpleTraverse, AST_NODE_TYPES, TSESTree } from '@typescript-eslint/typescript-estree';
import * as vscode from 'vscode';

/**
 * Represents a parsed test case or test suite from a source file.
 *
 * @property name - The display name of the test (extracted from the first argument)
 * @property type - The type of test function that was called
 * @property range - The source location range for displaying gutter icons
 * @property children - Nested tests (for describe/experiment blocks)
 */
export interface ParsedTest {
  name: string;
  type: 'describe' | 'it' | 'experiment' | 'test';
  range: vscode.Range;
  children: ParsedTest[];
}

/** Set of recognized test function names from @hapi/lab */
const TEST_FUNCTIONS = new Set(['describe', 'it', 'experiment', 'test']);

/**
 * Parses a JavaScript or TypeScript source file to extract test definitions.
 *
 * Uses the TypeScript ESLint parser to build an AST, then traverses it to find
 * calls to test functions (`test()`, `it()`, `describe()`, `experiment()`).
 * Extracts the test name from the first argument (string literal or template literal)
 * and records the source location for gutter icon placement.
 *
 * @param content - The source code content to parse
 * @returns Array of parsed test objects, empty array if parsing fails or no tests found
 */
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

/**
 * Escapes special regex characters in a string.
 *
 * Used to convert test names into safe regex patterns for the lab `-g` (grep) flag,
 * which filters tests by name using regex matching.
 *
 * @param text - The string to escape
 * @returns The string with all regex special characters escaped
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


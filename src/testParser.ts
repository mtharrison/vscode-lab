/**
 * @fileoverview Test file parser for hapi/lab Test Runner
 *
 * Uses AST parsing to detect test functions (`test()`, `it()`, `describe()`, `experiment()`)
 * in JavaScript and TypeScript files. Extracts test names and source locations for
 * integration with VSCode's Test Explorer.
 *
 * @module testParser
 */
import { parse, AST_NODE_TYPES, TSESTree } from '@typescript-eslint/typescript-estree';
import * as vscode from 'vscode';

/**
 * Represents a parsed test case or test suite from a source file.
 *
 * @property name - The display name of the test (extracted from the first argument)
 * @property type - The type of test function that was called
 * @property range - The source location range for displaying gutter icons
 * @property children - Nested tests (for describe/experiment blocks)
 * @property modifier - Optional modifier applied to the test ('only' | 'skip')
 */
export interface ParsedTest {
  name: string;
  type: 'describe' | 'it' | 'experiment' | 'test';
  range: vscode.Range;
  children: ParsedTest[];
  modifier?: 'only' | 'skip';
}

/** Set of recognized test function names from @hapi/lab */
const TEST_FUNCTIONS = new Set(['describe', 'it', 'experiment', 'test']);

/** Set of container test functions that can have nested tests */
const CONTAINER_FUNCTIONS = new Set(['describe', 'experiment']);

/**
 * Parses a JavaScript or TypeScript source file to extract test definitions.
 *
 * Uses the TypeScript ESLint parser to build an AST, then recursively traverses
 * it to find calls to test functions (`test()`, `it()`, `describe()`, `experiment()`).
 * Builds a hierarchical structure where describe/experiment blocks contain their
 * nested tests as children.
 *
 * @param content - The source code content to parse
 * @returns Array of parsed test objects with nested children, empty array if parsing fails
 */
export function parseTestFile(content: string): ParsedTest[] {
  try {
    const ast = parse(content, {
      loc: true,
      range: true,
      jsx: true,
    });

    return extractTestsFromStatements(ast.body);
  } catch {
    // Failed to parse - return empty tests array
    return [];
  }
}

/**
 * Recursively extracts test definitions from an array of AST statements.
 * Handles nested describe/experiment blocks by recursing into their callback bodies.
 */
function extractTestsFromStatements(statements: TSESTree.Statement[]): ParsedTest[] {
  const tests: ParsedTest[] = [];

  for (const statement of statements) {
    // Look for expression statements containing test function calls
    if (statement.type === AST_NODE_TYPES.ExpressionStatement) {
      const testInfo = extractTestFromExpression(statement.expression);
      if (testInfo) {
        tests.push(testInfo);
      }
    }
  }

  return tests;
}

/**
 * Extracts test info from an expression node if it's a test function call.
 * For describe/experiment blocks, recursively extracts children from the callback.
 * Supports both simple calls (it(), test()) and modifier calls (it.only(), it.skip()).
 */
function extractTestFromExpression(node: TSESTree.Expression): ParsedTest | null {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return null;
  }

  const callNode = node;
  let functionName: string;
  let modifier: 'only' | 'skip' | undefined;

  // Check if this is a simple test function call (e.g., it(), test())
  if (callNode.callee.type === AST_NODE_TYPES.Identifier) {
    if (!TEST_FUNCTIONS.has(callNode.callee.name)) {
      return null;
    }
    functionName = callNode.callee.name;
  }
  // Check if this is a member expression call (e.g., it.only(), it.skip())
  else if (callNode.callee.type === AST_NODE_TYPES.MemberExpression) {
    const memberExpr = callNode.callee;
    
    // Check if the object is a test function identifier
    if (
      memberExpr.object.type !== AST_NODE_TYPES.Identifier ||
      !TEST_FUNCTIONS.has(memberExpr.object.name)
    ) {
      return null;
    }
    
    // Check if the property is 'only' or 'skip'
    if (
      memberExpr.property.type !== AST_NODE_TYPES.Identifier ||
      (memberExpr.property.name !== 'only' && memberExpr.property.name !== 'skip')
    ) {
      return null;
    }
    
    functionName = memberExpr.object.name;
    modifier = memberExpr.property.name as 'only' | 'skip';
  } else {
    return null;
  }

  // Check if this call has the required arguments
  if (callNode.arguments.length < 2 || !callNode.loc) {
    return null;
  }

  const firstArg = callNode.arguments[0];
  if (
    firstArg.type !== AST_NODE_TYPES.Literal &&
    firstArg.type !== AST_NODE_TYPES.TemplateLiteral
  ) {
    return null;
  }

  // Extract test name
  let testName = 'unnamed test';
  if (firstArg.type === AST_NODE_TYPES.Literal && typeof (firstArg as TSESTree.Literal).value === 'string') {
    testName = (firstArg as TSESTree.Literal).value as string;
  } else if (firstArg.type === AST_NODE_TYPES.TemplateLiteral && firstArg.quasis.length > 0) {
    testName = firstArg.quasis.map((q) => q.value.cooked || q.value.raw).join('');
  }

  const range = new vscode.Range(
    callNode.loc.start.line - 1,
    callNode.loc.start.column,
    callNode.loc.end.line - 1,
    callNode.loc.end.column
  );

  const testType = functionName as ParsedTest['type'];
  let children: ParsedTest[] = [];

  // For describe/experiment blocks, extract children from the callback
  if (CONTAINER_FUNCTIONS.has(functionName)) {
    const callback = callNode.arguments[1];
    if (
      (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
       callback.type === AST_NODE_TYPES.FunctionExpression) &&
      callback.body.type === AST_NODE_TYPES.BlockStatement
    ) {
      children = extractTestsFromStatements(callback.body.body);
    }
  }

  const result: ParsedTest = {
    name: testName,
    type: testType,
    range,
    children,
  };

  if (modifier) {
    result.modifier = modifier;
  }

  return result;
}

/**
 * Characters that are safe to use literally in both regex patterns and shell commands.
 * These characters:
 * - Don't have special meaning in regex
 * - Don't have special meaning in bash/sh shells
 * - Don't cause word splitting or glob expansion
 */
const SAFE_PATTERN_CHARS = /^[a-zA-Z0-9_-]$/;

/**
 * Builds a robust grep pattern for matching a test name.
 *
 * This function creates a regex pattern that:
 * 1. Matches the test name when used with lab's -g (grep) flag
 * 2. Survives shell interpretation (including multiple layers like npm -> wrapper -> lab)
 * 3. Avoids shell injection or unexpected behavior
 *
 * Strategy: Only use characters that are "safe" in both regex and shell contexts.
 * Any character that might cause issues is replaced with '.' which matches any
 * single character in regex and is harmless in shells.
 *
 * Trade-off: This slightly reduces pattern precision (e.g., "test name" pattern
 * would also match "testXname"), but test names are typically unique enough that
 * this rarely causes false matches. The pattern maintains the same length as the
 * input, so each '.' corresponds to exactly one character position.
 *
 * Characters handled:
 * - Regex specials: . * + ? ^ $ { } ( ) [ ] | \
 * - Shell specials: space $ ` ' " ; | & < > ! ~ # * ? ( ) { } [ ] \
 * - Whitespace: tabs, carriage returns
 * - Unicode: any non-ASCII characters (including emoji surrogate pairs)
 *
 * Note: Newlines in test names are replaced with '.' but this won't match properly
 * since regex '.' doesn't match newlines by default. Test names with literal newlines
 * are extremely rare in practice.
 *
 * @param testName - The test name to convert to a pattern
 * @returns A regex pattern safe for shell and lab's -g flag
 */
export function buildTestPattern(testName: string): string {
  let pattern = '';

  // Use index-based iteration to handle UTF-16 code units properly
  // This ensures the pattern length matches the string's .length property,
  // which is important for regex matching (since JS regex operates on code units)
  for (let i = 0; i < testName.length; i++) {
    const char = testName[i];
    if (SAFE_PATTERN_CHARS.test(char)) {
      // Alphanumeric, underscore, hyphen - safe to use literally
      pattern += char;
    } else {
      // Everything else becomes '.' to match any single character
      // This handles: spaces, shell specials, regex specials, unicode, etc.
      pattern += '.';
    }
  }

  return pattern;
}

/**
 * @deprecated Use buildTestPattern instead. Kept for backward compatibility.
 *
 * Escapes special regex characters in a string.
 * Used to convert test names into safe regex patterns for the lab `-g` (grep) flag.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @deprecated Use buildTestPattern instead. Kept for backward compatibility.
 *
 * Escapes a string for safe use as a grep pattern across multiple shell layers.
 */
export function escapeShellArg(text: string): string {
  return text.replace(/ /g, '.');
}


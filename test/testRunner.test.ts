import { describe, it, expect } from 'vitest';
import { parseErrorMessage } from '../src/testRunner';

describe('testRunner', () => {
  describe('parseErrorMessage', () => {
    it('should parse simple string comparison failure', () => {
      const output = `
Failed tests:

  1) Example test should fail with actual/expected mismatch:

      actual expected

      'aababa'

      Expected 'aaba' to equal specified value: 'ba'

      at /tmp/lab-test-example/test.js:11:27
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.message).toContain("Expected 'aaba' to equal specified value: 'ba'");
      expect(result?.actualOutput).toBe('aaba');
      expect(result?.expectedOutput).toBe('ba');
    });

    it('should parse number comparison failure', () => {
      const output = `
Failed tests:

  1) Example test should fail with number mismatch:

      actual expected

      42100

      Expected 42 to equal specified value: 100

      at /tmp/lab-test-example/test.js:15:23
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.message).toContain('Expected 42 to equal specified value: 100');
      expect(result?.actualOutput).toBe('42');
      expect(result?.expectedOutput).toBe('100');
    });

    it('should parse object comparison failure', () => {
      const output = `
Failed tests:

  1) Example test should fail with object mismatch:

      actual expected

      {
        baz: 123456,
        foo: 'bar'
      }

      Expected { foo: 'bar', baz: 123 } to equal specified value: { foo: 'bar', baz: 456 }

      at /tmp/lab-test-example/test.js:19:45
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.message).toContain("Expected { foo: 'bar', baz: 123 } to equal specified value: { foo: 'bar', baz: 456 }");
      expect(result?.actualOutput).toBe("{ foo: 'bar', baz: 123 }");
      expect(result?.expectedOutput).toBe("{ foo: 'bar', baz: 456 }");
    });

    it('should handle errors without expected values', () => {
      const output = `
Failed tests:

  1) Example test should throw error:

      Error: Something went wrong
      
      at /tmp/lab-test-example/test.js:23:15
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.message).toContain('Error: Something went wrong');
      expect(result?.actualOutput).toBeUndefined();
      expect(result?.expectedOutput).toBeUndefined();
    });

    it('should handle generic AssertionError', () => {
      const output = `
Failed tests:

  1) Example test should fail:

      AssertionError: expected value to be truthy

      at /tmp/lab-test-example/test.js:27:10
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.message).toContain('AssertionError: expected value to be truthy');
      expect(result?.actualOutput).toBeUndefined();
      expect(result?.expectedOutput).toBeUndefined();
    });

    it('should strip ANSI escape codes', () => {
      // ANSI codes for red and reset
      const output = `
Failed tests:

  1) Example test:

      \u001b[31mExpected 'foo' to equal specified value: 'bar'\u001b[0m

      at /tmp/test.js:10:20
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.message).toContain("Expected 'foo' to equal specified value: 'bar'");
      expect(result?.message).not.toContain('\u001b[31m');
      expect(result?.message).not.toContain('\u001b[0m');
      expect(result?.actualOutput).toBe('foo');
      expect(result?.expectedOutput).toBe('bar');
    });

    it('should return undefined for empty output', () => {
      const result = parseErrorMessage('');
      expect(result).toBeUndefined();
    });

    it('should return undefined for output without errors', () => {
      const output = `
Example test
  ✓ 1) should pass (10 ms)

1 of 1 tests passed
`;

      const result = parseErrorMessage(output);
      expect(result).toBeUndefined();
    });

    it('should handle multiline actual/expected values', () => {
      const output = `
Failed tests:

  1) Example test:

      Expected {
        foo: 'bar',
        nested: { a: 1 }
      } to equal specified value: {
        foo: 'baz',
        nested: { a: 2 }
      }

      at /tmp/test.js:10:20
`;

      const result = parseErrorMessage(output);

      expect(result).toBeDefined();
      expect(result?.actualOutput).toContain('foo');
      expect(result?.expectedOutput).toContain('baz');
    });
  });
});

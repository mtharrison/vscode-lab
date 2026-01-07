import { describe, it, expect } from 'vitest';
import { parseTestFile, escapeRegExp } from '../src/testParser';

describe('testParser', () => {
  describe('parseTestFile', () => {
    it('should parse simple it() blocks', () => {
      const code = `
        it('should do something', () => {
          expect(true).toBe(true);
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('should do something');
      expect(tests[0].type).toBe('it');
    });

    it('should parse describe() blocks', () => {
      const code = `
        describe('MyModule', () => {
          it('should work', () => {});
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(2);
      const names = tests.map((t) => t.name);
      expect(names).toContain('MyModule');
      expect(names).toContain('should work');

      const describeTest = tests.find((t) => t.name === 'MyModule');
      const itTest = tests.find((t) => t.name === 'should work');
      expect(describeTest?.type).toBe('describe');
      expect(itTest?.type).toBe('it');
    });

    it('should parse Lab-specific experiment() blocks', () => {
      const code = `
        experiment('My Experiment', () => {
          test('should pass', () => {});
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(2);
      const names = tests.map((t) => t.name);
      expect(names).toContain('My Experiment');
      expect(names).toContain('should pass');

      const experimentTest = tests.find((t) => t.name === 'My Experiment');
      const testTest = tests.find((t) => t.name === 'should pass');
      expect(experimentTest?.type).toBe('experiment');
      expect(testTest?.type).toBe('test');
    });

    it('should handle multiple tests', () => {
      const code = `
        describe('Calculator', () => {
          it('should add numbers', () => {});
          it('should subtract numbers', () => {});
          it('should multiply numbers', () => {});
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(4);
      const names = tests.map((t) => t.name).sort();
      expect(names).toEqual([
        'Calculator',
        'should add numbers',
        'should multiply numbers',
        'should subtract numbers',
      ]);
    });

    it('should include range information', () => {
      const code = `it('test', () => {});`;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].range).toBeDefined();
      expect(tests[0].range.startLine).toBe(0);
      expect(tests[0].range.startCharacter).toBe(0);
    });

    it('should handle empty files', () => {
      const tests = parseTestFile('');
      expect(tests).toHaveLength(0);
    });

    it('should handle files with no tests', () => {
      const code = `
        const x = 1;
        function foo() { return x; }
      `;

      const tests = parseTestFile(code);
      expect(tests).toHaveLength(0);
    });

    it('should handle syntax errors gracefully', () => {
      const code = `
        it('broken test' () => {
          // missing comma
        });
      `;

      const tests = parseTestFile(code);
      expect(tests).toHaveLength(0);
    });

    it('should handle async tests', () => {
      const code = `
        it('async test', async () => {
          await Promise.resolve();
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('async test');
    });

    it('should handle tests with options object', () => {
      const code = `
        it('test with options', { timeout: 5000 }, () => {});
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('test with options');
    });
  });

  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      expect(escapeRegExp('test.name')).toBe('test\\.name');
      expect(escapeRegExp('test*name')).toBe('test\\*name');
      expect(escapeRegExp('test+name')).toBe('test\\+name');
      expect(escapeRegExp('test?name')).toBe('test\\?name');
      expect(escapeRegExp('test^name')).toBe('test\\^name');
      expect(escapeRegExp('test$name')).toBe('test\\$name');
      expect(escapeRegExp('test{name}')).toBe('test\\{name\\}');
      expect(escapeRegExp('test(name)')).toBe('test\\(name\\)');
      expect(escapeRegExp('test[name]')).toBe('test\\[name\\]');
      expect(escapeRegExp('test|name')).toBe('test\\|name');
      expect(escapeRegExp('test\\name')).toBe('test\\\\name');
    });

    it('should handle strings without special characters', () => {
      expect(escapeRegExp('simple test name')).toBe('simple test name');
    });

    it('should handle empty strings', () => {
      expect(escapeRegExp('')).toBe('');
    });

    it('should handle multiple special characters', () => {
      expect(escapeRegExp('test.name (with) [brackets]')).toBe(
        'test\\.name \\(with\\) \\[brackets\\]'
      );
    });
  });
});

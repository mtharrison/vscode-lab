import { describe, it, expect } from 'vitest';
import { parseTestFile, escapeRegExp, escapeShellArg } from '../src/testParser';

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

    it('should parse TypeScript files with type annotations', () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }

        const createUser = (name: string, age: number): User => ({ name, age });

        describe('User creation', () => {
          it('should create a user with valid data', () => {
            const user: User = createUser('test', 25);
            expect(user.name).toBe('test');
          });
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(2);
      const names = tests.map((t) => t.name);
      expect(names).toContain('User creation');
      expect(names).toContain('should create a user with valid data');
    });

    it('should parse TypeScript files with generics', () => {
      const code = `
        function identity<T>(value: T): T {
          return value;
        }

        it('should handle generic functions', () => {
          const result = identity<string>('test');
          expect(result).toBe('test');
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('should handle generic functions');
    });

    it('should parse TypeScript files with type aliases and unions', () => {
      const code = `
        type Status = 'pending' | 'success' | 'error';
        type Result<T> = { status: Status; data: T | null };

        describe('Result handling', () => {
          it('should handle success result', () => {
            const result: Result<string> = { status: 'success', data: 'test' };
            expect(result.status).toBe('success');
          });
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(2);
      expect(tests.map((t) => t.name)).toContain('should handle success result');
    });

    it('should parse TypeScript files with enums', () => {
      const code = `
        enum Direction {
          Up = 'UP',
          Down = 'DOWN',
        }

        it('should use enum values', () => {
          const dir: Direction = Direction.Up;
          expect(dir).toBe('UP');
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('should use enum values');
    });

    it('should parse TypeScript files with class syntax', () => {
      const code = `
        class Calculator {
          private value: number = 0;

          public add(n: number): this {
            this.value += n;
            return this;
          }

          public getValue(): number {
            return this.value;
          }
        }

        describe('Calculator', () => {
          it('should add numbers', () => {
            const calc = new Calculator();
            expect(calc.add(5).getValue()).toBe(5);
          });
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(2);
      expect(tests.map((t) => t.name)).toContain('should add numbers');
    });

    it('should parse TypeScript files with as assertions', () => {
      const code = `
        it('should handle type assertions', () => {
          const value = JSON.parse('{"name": "test"}') as { name: string };
          expect(value.name).toBe('test');
        });
      `;

      const tests = parseTestFile(code);

      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('should handle type assertions');
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

  describe('escapeShellArg', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArg('test')).toBe("'test'");
    });

    it('should preserve spaces inside quotes', () => {
      expect(escapeShellArg('creates a snapshot')).toBe("'creates a snapshot'");
    });

    it('should escape embedded single quotes', () => {
      expect(escapeShellArg("test's name")).toBe("'test'\\''s name'");
    });

    it('should handle multiple single quotes', () => {
      expect(escapeShellArg("it's a test's test")).toBe("'it'\\''s a test'\\''s test'");
    });

    it('should handle empty strings', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should handle strings with special shell characters', () => {
      expect(escapeShellArg('test$var')).toBe("'test$var'");
      expect(escapeShellArg('test`cmd`')).toBe("'test`cmd`'");
      expect(escapeShellArg('test;rm -rf')).toBe("'test;rm -rf'");
    });

    it('should handle regex-escaped strings with spaces', () => {
      // Typical usage: escapeShellArg(escapeRegExp(testName))
      const regexEscaped = escapeRegExp('test.name (with) spaces');
      expect(escapeShellArg(regexEscaped)).toBe("'test\\.name \\(with\\) spaces'");
    });
  });

});

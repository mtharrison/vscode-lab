import { describe, it, expect } from 'vitest';
import { parseTestFile, escapeRegExp, escapeShellArg, buildTestPattern } from '../src/testParser';

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

  describe('escapeShellArg (deprecated)', () => {
    it('should leave simple strings without spaces unchanged', () => {
      expect(escapeShellArg('test')).toBe('test');
    });

    it('should replace spaces with dots for shell safety', () => {
      expect(escapeShellArg('creates a snapshot')).toBe('creates.a.snapshot');
    });

    it('should handle multiple consecutive spaces', () => {
      expect(escapeShellArg('test  with  double  spaces')).toBe('test..with..double..spaces');
    });

    it('should handle empty strings', () => {
      expect(escapeShellArg('')).toBe('');
    });

    it('should leave strings with special characters unchanged (no quoting)', () => {
      // Shell special chars pass through - they won't cause issues without spaces
      expect(escapeShellArg('test$var')).toBe('test$var');
      expect(escapeShellArg("test's")).toBe("test's");
    });

    it('should handle regex-escaped strings with spaces', () => {
      // Typical usage: escapeShellArg(escapeRegExp(testName))
      // The regex escaping preserves dots as \. and spaces become .
      const regexEscaped = escapeRegExp('test.name (with) spaces');
      expect(escapeShellArg(regexEscaped)).toBe('test\\.name.\\(with\\).spaces');
    });

    it('should produce patterns that match test names in lab -g', () => {
      // The resulting pattern should match the original test name
      const testName = 'exports TEST_CONFIG for use by other repos';
      const escaped = escapeShellArg(escapeRegExp(testName));
      // The pattern 'exports.TEST_CONFIG.for.use.by.other.repos'
      // will match 'exports TEST_CONFIG for use by other repos' since . matches any char
      const regex = new RegExp(escaped);
      expect(regex.test(testName)).toBe(true);
    });
  });

  describe('buildTestPattern', () => {
    // ===========================================
    // BASIC CASES
    // ===========================================
    describe('basic cases', () => {
      it('should handle empty string', () => {
        expect(buildTestPattern('')).toBe('');
      });

      it('should preserve simple alphanumeric names', () => {
        expect(buildTestPattern('test')).toBe('test');
        expect(buildTestPattern('myTest123')).toBe('myTest123');
        expect(buildTestPattern('TEST')).toBe('TEST');
      });

      it('should preserve underscores', () => {
        expect(buildTestPattern('test_name')).toBe('test_name');
        expect(buildTestPattern('__private__')).toBe('__private__');
      });

      it('should preserve hyphens', () => {
        expect(buildTestPattern('test-name')).toBe('test-name');
        expect(buildTestPattern('kebab-case-name')).toBe('kebab-case-name');
      });

      it('should preserve mixed safe characters', () => {
        expect(buildTestPattern('test_name-123')).toBe('test_name-123');
        expect(buildTestPattern('My_Test-Case_v2')).toBe('My_Test-Case_v2');
      });
    });

    // ===========================================
    // SPACE HANDLING
    // ===========================================
    describe('space handling', () => {
      it('should replace single spaces with dots', () => {
        expect(buildTestPattern('test name')).toBe('test.name');
        expect(buildTestPattern('should do something')).toBe('should.do.something');
      });

      it('should replace multiple consecutive spaces with multiple dots', () => {
        expect(buildTestPattern('test  name')).toBe('test..name');
        expect(buildTestPattern('test   name')).toBe('test...name');
      });

      it('should handle leading spaces', () => {
        expect(buildTestPattern(' test')).toBe('.test');
        expect(buildTestPattern('  test')).toBe('..test');
      });

      it('should handle trailing spaces', () => {
        expect(buildTestPattern('test ')).toBe('test.');
        expect(buildTestPattern('test  ')).toBe('test..');
      });

      it('should handle only spaces', () => {
        expect(buildTestPattern(' ')).toBe('.');
        expect(buildTestPattern('   ')).toBe('...');
      });
    });

    // ===========================================
    // REGEX SPECIAL CHARACTERS
    // ===========================================
    describe('regex special characters', () => {
      it('should replace period with dot', () => {
        expect(buildTestPattern('test.name')).toBe('test.name');
        expect(buildTestPattern('v1.2.3')).toBe('v1.2.3');
      });

      it('should replace asterisk with dot', () => {
        expect(buildTestPattern('test*')).toBe('test.');
        expect(buildTestPattern('*test*')).toBe('.test.');
      });

      it('should replace plus with dot', () => {
        expect(buildTestPattern('test+')).toBe('test.');
        expect(buildTestPattern('a+b')).toBe('a.b');
      });

      it('should replace question mark with dot', () => {
        expect(buildTestPattern('test?')).toBe('test.');
        expect(buildTestPattern('is it working?')).toBe('is.it.working.');
      });

      it('should replace caret with dot', () => {
        expect(buildTestPattern('^test')).toBe('.test');
        expect(buildTestPattern('test^name')).toBe('test.name');
      });

      it('should replace dollar sign with dot', () => {
        expect(buildTestPattern('test$')).toBe('test.');
        expect(buildTestPattern('$test')).toBe('.test');
        expect(buildTestPattern('$100')).toBe('.100');
      });

      it('should replace curly braces with dots', () => {
        expect(buildTestPattern('test{1}')).toBe('test.1.');
        expect(buildTestPattern('{a,b}')).toBe('.a.b.');
        expect(buildTestPattern('test{1,3}')).toBe('test.1.3.');
      });

      it('should replace parentheses with dots', () => {
        expect(buildTestPattern('test(name)')).toBe('test.name.');
        expect(buildTestPattern('(test)')).toBe('.test.');
        expect(buildTestPattern('func()')).toBe('func..');
      });

      it('should replace square brackets with dots', () => {
        expect(buildTestPattern('test[0]')).toBe('test.0.');
        expect(buildTestPattern('[test]')).toBe('.test.');
        expect(buildTestPattern('array[index]')).toBe('array.index.');
      });

      it('should replace pipe with dot', () => {
        expect(buildTestPattern('a|b')).toBe('a.b');
        expect(buildTestPattern('test|name')).toBe('test.name');
      });

      it('should replace backslash with dot', () => {
        expect(buildTestPattern('test\\name')).toBe('test.name');
        expect(buildTestPattern('path\\to\\file')).toBe('path.to.file');
      });
    });

    // ===========================================
    // SHELL SPECIAL CHARACTERS
    // ===========================================
    describe('shell special characters', () => {
      it('should replace backticks with dots', () => {
        expect(buildTestPattern('test`command`')).toBe('test.command.');
        expect(buildTestPattern('`whoami`')).toBe('.whoami.');
      });

      it('should replace single quotes with dots', () => {
        expect(buildTestPattern("test's")).toBe('test.s');
        expect(buildTestPattern("it's working")).toBe('it.s.working');
        expect(buildTestPattern("'quoted'")).toBe('.quoted.');
      });

      it('should replace double quotes with dots', () => {
        expect(buildTestPattern('test"name"')).toBe('test.name.');
        expect(buildTestPattern('"quoted"')).toBe('.quoted.');
      });

      it('should replace semicolon with dot', () => {
        expect(buildTestPattern('test;name')).toBe('test.name');
        expect(buildTestPattern('cmd1;cmd2')).toBe('cmd1.cmd2');
      });

      it('should replace ampersand with dot', () => {
        expect(buildTestPattern('test&name')).toBe('test.name');
        expect(buildTestPattern('a&&b')).toBe('a..b');
      });

      it('should replace redirects with dots', () => {
        expect(buildTestPattern('test>file')).toBe('test.file');
        expect(buildTestPattern('test<file')).toBe('test.file');
        expect(buildTestPattern('test>>file')).toBe('test..file');
      });

      it('should replace exclamation mark with dot', () => {
        expect(buildTestPattern('test!')).toBe('test.');
        expect(buildTestPattern('!important')).toBe('.important');
      });

      it('should replace tilde with dot', () => {
        expect(buildTestPattern('~user')).toBe('.user');
        expect(buildTestPattern('test~')).toBe('test.');
      });

      it('should replace hash with dot', () => {
        expect(buildTestPattern('#comment')).toBe('.comment');
        expect(buildTestPattern('test#1')).toBe('test.1');
      });

      it('should replace at sign with dot', () => {
        expect(buildTestPattern('test@example')).toBe('test.example');
        expect(buildTestPattern('@decorator')).toBe('.decorator');
      });

      it('should replace percent with dot', () => {
        expect(buildTestPattern('100%')).toBe('100.');
        expect(buildTestPattern('%s')).toBe('.s');
      });

      it('should replace equals with dot', () => {
        expect(buildTestPattern('a=b')).toBe('a.b');
        expect(buildTestPattern('test=value')).toBe('test.value');
      });

      it('should replace colon with dot', () => {
        expect(buildTestPattern('test:name')).toBe('test.name');
        expect(buildTestPattern('12:34:56')).toBe('12.34.56');
      });

      it('should replace forward slash with dot', () => {
        expect(buildTestPattern('path/to/file')).toBe('path.to.file');
        expect(buildTestPattern('a/b')).toBe('a.b');
      });

      it('should replace comma with dot', () => {
        expect(buildTestPattern('a,b,c')).toBe('a.b.c');
        expect(buildTestPattern('test, name')).toBe('test..name');
      });
    });

    // ===========================================
    // WHITESPACE CHARACTERS
    // ===========================================
    describe('whitespace characters', () => {
      it('should replace tabs with dots', () => {
        expect(buildTestPattern('test\tname')).toBe('test.name');
        expect(buildTestPattern('\t\t')).toBe('..');
      });

      it('should replace newlines with dots', () => {
        expect(buildTestPattern('test\nname')).toBe('test.name');
        expect(buildTestPattern('line1\nline2')).toBe('line1.line2');
      });

      it('should replace carriage returns with dots', () => {
        expect(buildTestPattern('test\rname')).toBe('test.name');
        expect(buildTestPattern('test\r\nname')).toBe('test..name');
      });

      it('should replace mixed whitespace with dots', () => {
        expect(buildTestPattern('test \t\n name')).toBe('test....name');
      });
    });

    // ===========================================
    // UNICODE CHARACTERS
    // ===========================================
    describe('unicode characters', () => {
      it('should replace accented characters with dots', () => {
        expect(buildTestPattern('café')).toBe('caf.');
        expect(buildTestPattern('naïve')).toBe('na.ve');
        expect(buildTestPattern('résumé')).toBe('r.sum.');
      });

      it('should replace emoji with dots (2 dots per emoji for surrogate pairs)', () => {
        // Emoji like 🎉 are represented as surrogate pairs in UTF-16 (2 code units)
        // The pattern needs to match the string length for regex to work properly
        expect(buildTestPattern('test🎉')).toBe('test..');  // 🎉 = 2 code units
        expect(buildTestPattern('👍test')).toBe('..test');  // 👍 = 2 code units
        expect(buildTestPattern('🎉🎊')).toBe('....');       // 4 code units total
      });

      it('should replace Chinese characters with dots', () => {
        expect(buildTestPattern('测试')).toBe('..');
        expect(buildTestPattern('test测试')).toBe('test..');
      });

      it('should replace other unicode symbols with dots', () => {
        expect(buildTestPattern('test™')).toBe('test.');
        expect(buildTestPattern('©2024')).toBe('.2024');
        expect(buildTestPattern('test→result')).toBe('test.result');
      });
    });

    // ===========================================
    // COMBINED EDGE CASES
    // ===========================================
    describe('combined edge cases', () => {
      it('should handle realistic test names with spaces and parentheses', () => {
        const pattern = buildTestPattern('should create a user (when valid)');
        expect(pattern).toBe('should.create.a.user..when.valid.');
      });

      it('should handle test names with method calls', () => {
        const pattern = buildTestPattern('Array.prototype.map() works');
        expect(pattern).toBe('Array.prototype.map...works');
      });

      it('should handle test names with paths', () => {
        const pattern = buildTestPattern('loads /api/users endpoint');
        expect(pattern).toBe('loads..api.users.endpoint');
      });

      it('should handle test names with URLs', () => {
        const pattern = buildTestPattern('fetches https://api.example.com/data');
        expect(pattern).toBe('fetches.https...api.example.com.data');
      });

      it('should handle test names with JSON-like content', () => {
        const pattern = buildTestPattern('parses {"key": "value"}');
        expect(pattern).toBe('parses...key....value..');
      });

      it('should handle test names with shell-dangerous patterns', () => {
        const pattern = buildTestPattern('test $(whoami) injection');
        expect(pattern).toBe('test...whoami..injection');
      });

      it('should handle test names with backtick injection attempts', () => {
        const pattern = buildTestPattern('test `rm -rf /` name');
        expect(pattern).toBe('test..rm.-rf....name');
      });

      it('should handle test names with multiple special char types', () => {
        // "test's [value] = $100 & 50%" character breakdown:
        // test = safe, ' = ., s = safe, space = ., [ = ., value = safe, ] = .
        // space = ., = = ., space = ., $ = ., 100 = safe, space = .
        // & = ., space = ., 50 = safe, % = .
        const pattern = buildTestPattern("test's [value] = $100 & 50%");
        expect(pattern).toBe('test.s..value.....100...50.');
      });

      it('should handle very long test names', () => {
        const longName = 'a'.repeat(1000);
        const pattern = buildTestPattern(longName);
        expect(pattern).toBe(longName);
        expect(pattern.length).toBe(1000);
      });

      it('should handle test names that are all special characters', () => {
        const pattern = buildTestPattern('!@#$%^&*()');
        expect(pattern).toBe('..........');
        expect(pattern.length).toBe(10);
      });
    });

    // ===========================================
    // PATTERN MATCHING VALIDATION
    // ===========================================
    describe('pattern matching validation', () => {
      const testCases = [
        'simple test',
        'test with spaces',
        'test.with.dots',
        'test(with)parens',
        'test[with]brackets',
        "test's apostrophe",
        'test "quotes"',
        'test $variable',
        'test `backticks`',
        'test; semicolon',
        'test | pipe',
        'test & ampersand',
        'test > redirect',
        'test\ttab',
        // Note: newlines are NOT included because regex '.' doesn't match \n
        'exports TEST_CONFIG for use by other repos',
        'should handle Array.prototype.map()',
        'parses JSON {"key": "value"}',
        'handles /api/v1/users/:id path',
        'supports special chars: !@#$%^&*()',
      ];

      testCases.forEach(testName => {
        it(`pattern for "${testName.slice(0, 40)}${testName.length > 40 ? '...' : ''}" should match original`, () => {
          const pattern = buildTestPattern(testName);
          const regex = new RegExp(pattern);
          expect(regex.test(testName)).toBe(true);
        });
      });

      it('should maintain same length as input for ASCII', () => {
        const testCases = [
          'simple',
          'with spaces',
          'special!@#chars',
          'mixed_with-hyphens',
        ];
        testCases.forEach(testName => {
          const pattern = buildTestPattern(testName);
          expect(pattern.length).toBe(testName.length);
        });
      });

      it('documents newline limitation: pattern does not match newlines', () => {
        // This is a known limitation: regex '.' does not match newlines by default
        // Test names with literal newlines are extremely rare in practice
        const testName = 'test\nnewline';
        const pattern = buildTestPattern(testName);
        const regex = new RegExp(pattern);
        // The pattern is correctly generated but won't match due to regex '.' limitation
        expect(regex.test(testName)).toBe(false);
        // But the pattern is still shell-safe
        expect(pattern).toMatch(/^[a-zA-Z0-9_.\-]*$/);
      });
    });

    // ===========================================
    // PATTERN SPECIFICITY
    // ===========================================
    describe('pattern specificity', () => {
      it('should not match significantly different names', () => {
        const pattern = buildTestPattern('test one');
        const regex = new RegExp(`^${pattern}$`);

        // Should match original
        expect(regex.test('test one')).toBe(true);
        // Should match with any char in place of space
        expect(regex.test('testXone')).toBe(true);

        // Should NOT match different lengths
        expect(regex.test('test')).toBe(false);
        expect(regex.test('test one two')).toBe(false);
        expect(regex.test('test onetwo')).toBe(false);
      });

      it('should differentiate tests by length', () => {
        const pattern1 = buildTestPattern('test a');
        const pattern2 = buildTestPattern('test ab');

        expect(pattern1.length).not.toBe(pattern2.length);

        const regex1 = new RegExp(`^${pattern1}$`);
        const regex2 = new RegExp(`^${pattern2}$`);

        expect(regex1.test('test a')).toBe(true);
        expect(regex1.test('test ab')).toBe(false);

        expect(regex2.test('test ab')).toBe(true);
        expect(regex2.test('test a')).toBe(false);
      });
    });

    // ===========================================
    // REAL WORLD TEST NAMES
    // ===========================================
    describe('real world test names', () => {
      // Test names that can be matched by the generated pattern
      const matchableTestNames = [
        'creates a snapshot',
        'exports TEST_CONFIG for use by other repos',
        'should handle errors gracefully',
        'returns 404 for missing resource',
        'validates email@example.com format',
        "doesn't crash on null input",
        'processes $100.00 correctly',
        'handles [array] notation',
        'supports {object} syntax',
        'works with path/to/file',
        'handles Unicode: café, naïve',
        'Math.random() returns number',
        'Array.prototype.map() transforms',
        'handles async/await properly',
        'GET /api/users returns 200',
        'POST /api/users creates user',
        'throws Error("message")',
        'handles "quoted strings"',
        "handles 'single quotes'",
        'handles `template literals`',
        'handles tabs\tin strings',
      ];

      matchableTestNames.forEach(testName => {
        it(`should create valid pattern for: "${testName.slice(0, 50)}${testName.length > 50 ? '...' : ''}"`, () => {
          const pattern = buildTestPattern(testName);

          // Pattern should only contain safe chars and dots
          expect(pattern).toMatch(/^[a-zA-Z0-9_.\-]*$/);

          // Pattern should match original
          const regex = new RegExp(pattern);
          expect(regex.test(testName)).toBe(true);
        });
      });

      it('should create shell-safe pattern even for unmatchable names (newlines)', () => {
        // Newlines in test names are rare but the pattern should still be shell-safe
        const testName = 'handles newlines\nin strings';
        const pattern = buildTestPattern(testName);

        // Pattern should only contain safe chars and dots
        expect(pattern).toMatch(/^[a-zA-Z0-9_.\-]*$/);

        // Note: won't match because '.' doesn't match newlines in regex
        // This is a documented limitation for an extremely rare edge case
      });
    });

    // ===========================================
    // SHELL SAFETY VALIDATION
    // ===========================================
    describe('shell safety validation', () => {
      it('should produce patterns containing only shell-safe characters', () => {
        const dangerousNames = [
          '$(whoami)',
          '`rm -rf /`',
          'test; echo hacked',
          'test && echo hacked',
          'test || echo hacked',
          'test | cat /etc/passwd',
          'test > /tmp/hacked',
          'test < /etc/passwd',
          '${PATH}',
          '$(cat /etc/passwd)',
          "test'; echo hacked; #",
          'test"; echo hacked; #',
          'test\necho hacked',
          'test`echo hacked`',
        ];

        dangerousNames.forEach(name => {
          const pattern = buildTestPattern(name);
          // Pattern should only contain alphanumeric, underscore, hyphen, and dot
          expect(pattern).toMatch(/^[a-zA-Z0-9_.\-]*$/);
        });
      });

      it('should neutralize command injection attempts', () => {
        const injectionAttempts = [
          { input: '$(id)', expected: '..id.' },
          { input: '`id`', expected: '.id.' },
          { input: '; id', expected: '..id' },
          { input: '| id', expected: '..id' },
          { input: '&& id', expected: '...id' },
          { input: '|| id', expected: '...id' },
        ];

        injectionAttempts.forEach(({ input, expected }) => {
          expect(buildTestPattern(input)).toBe(expected);
        });
      });
    });
  });

});

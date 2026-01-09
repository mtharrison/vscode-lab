import { describe, it, expect } from 'vitest';
import {
  splitCommandIntoSegments,
  analyzeSegment,
  optimizeCommand,
  optimizePretestScript,
  removeCoverageFlags,
  isPretestEssential,
  describeOptimizations,
  type OptimizationOptions,
} from '../src/testCommandOptimizer';

describe('testCommandOptimizer', () => {
  describe('splitCommandIntoSegments', () => {
    it('should split commands by &&', () => {
      const result = splitCommandIntoSegments('npm run lint && npm test');
      expect(result).toEqual([
        { segment: 'npm run lint', separator: '&&' },
        { segment: 'npm test', separator: '' },
      ]);
    });

    it('should split commands by ||', () => {
      const result = splitCommandIntoSegments('npm run lint || echo "lint failed"');
      expect(result).toEqual([
        { segment: 'npm run lint', separator: '||' },
        { segment: 'echo "lint failed"', separator: '' },
      ]);
    });

    it('should split commands by ;', () => {
      const result = splitCommandIntoSegments('npm run lint; npm test');
      expect(result).toEqual([
        { segment: 'npm run lint', separator: ';' },
        { segment: 'npm test', separator: '' },
      ]);
    });

    it('should handle multiple separators', () => {
      const result = splitCommandIntoSegments('a && b || c; d');
      expect(result).toEqual([
        { segment: 'a', separator: '&&' },
        { segment: 'b', separator: '||' },
        { segment: 'c', separator: ';' },
        { segment: 'd', separator: '' },
      ]);
    });

    it('should respect quoted strings with single quotes', () => {
      const result = splitCommandIntoSegments("echo 'a && b' && test");
      expect(result).toEqual([
        { segment: "echo 'a && b'", separator: '&&' },
        { segment: 'test', separator: '' },
      ]);
    });

    it('should respect quoted strings with double quotes', () => {
      const result = splitCommandIntoSegments('echo "a && b" && test');
      expect(result).toEqual([
        { segment: 'echo "a && b"', separator: '&&' },
        { segment: 'test', separator: '' },
      ]);
    });

    it('should handle single command', () => {
      const result = splitCommandIntoSegments('npm test');
      expect(result).toEqual([{ segment: 'npm test', separator: '' }]);
    });

    it('should handle empty string', () => {
      const result = splitCommandIntoSegments('');
      expect(result).toEqual([]);
    });

    it('should trim whitespace', () => {
      const result = splitCommandIntoSegments('  npm run lint  &&  npm test  ');
      expect(result).toEqual([
        { segment: 'npm run lint', separator: '&&' },
        { segment: 'npm test', separator: '' },
      ]);
    });
  });

  describe('analyzeSegment', () => {
    const defaultOptions: OptimizationOptions = {
      skipLinting: true,
      skipCoverage: true,
      skipTypeCheck: true,
    };

    describe('linting detection', () => {
      it('should detect eslint', () => {
        const result = analyzeSegment('eslint src --ext ts', defaultOptions);
        expect(result.category).toBe('lint');
        expect(result.isEssential).toBe(false);
      });

      it('should detect prettier', () => {
        const result = analyzeSegment('prettier --check src', defaultOptions);
        expect(result.category).toBe('lint');
        expect(result.isEssential).toBe(false);
      });

      it('should detect npm run lint', () => {
        const result = analyzeSegment('npm run lint', defaultOptions);
        expect(result.category).toBe('lint');
        expect(result.isEssential).toBe(false);
      });

      it('should detect tslint', () => {
        const result = analyzeSegment('tslint src/**/*.ts', defaultOptions);
        expect(result.category).toBe('lint');
        expect(result.isEssential).toBe(false);
      });

      it('should detect biome lint', () => {
        const result = analyzeSegment('biome lint src', defaultOptions);
        expect(result.category).toBe('lint');
        expect(result.isEssential).toBe(false);
      });

      it('should mark linting as essential when skipLinting is false', () => {
        const options = { ...defaultOptions, skipLinting: false };
        const result = analyzeSegment('eslint src', options);
        expect(result.category).toBe('lint');
        expect(result.isEssential).toBe(true);
      });
    });

    describe('coverage detection', () => {
      it('should detect nyc', () => {
        const result = analyzeSegment('nyc mocha', defaultOptions);
        expect(result.category).toBe('coverage');
        expect(result.isEssential).toBe(false);
      });

      it('should detect c8', () => {
        const result = analyzeSegment('c8 node test.js', defaultOptions);
        expect(result.category).toBe('coverage');
        expect(result.isEssential).toBe(false);
      });

      it('should detect --coverage flag', () => {
        const result = analyzeSegment('vitest run --coverage', defaultOptions);
        expect(result.category).toBe('coverage');
        expect(result.isEssential).toBe(false);
      });

      it('should detect npm run coverage', () => {
        const result = analyzeSegment('npm run test:coverage', defaultOptions);
        expect(result.category).toBe('coverage');
        expect(result.isEssential).toBe(false);
      });

      it('should mark coverage as essential when skipCoverage is false', () => {
        const options = { ...defaultOptions, skipCoverage: false };
        const result = analyzeSegment('nyc mocha', options);
        expect(result.category).toBe('coverage');
        expect(result.isEssential).toBe(true);
      });
    });

    describe('type checking detection', () => {
      it('should detect tsc', () => {
        const result = analyzeSegment('tsc -p ./', defaultOptions);
        expect(result.category).toBe('typecheck');
        expect(result.isEssential).toBe(false);
      });

      it('should detect tsc --noEmit', () => {
        const result = analyzeSegment('tsc --noEmit', defaultOptions);
        expect(result.category).toBe('typecheck');
        expect(result.isEssential).toBe(false);
      });

      it('should detect npm run typecheck', () => {
        const result = analyzeSegment('npm run typecheck', defaultOptions);
        expect(result.category).toBe('typecheck');
        expect(result.isEssential).toBe(false);
      });

      it('should detect npm run type-check', () => {
        const result = analyzeSegment('npm run type-check', defaultOptions);
        expect(result.category).toBe('typecheck');
        expect(result.isEssential).toBe(false);
      });

      it('should mark typecheck as essential when skipTypeCheck is false', () => {
        const options = { ...defaultOptions, skipTypeCheck: false };
        const result = analyzeSegment('tsc -p ./', options);
        expect(result.category).toBe('typecheck');
        expect(result.isEssential).toBe(true);
      });
    });

    describe('test command detection', () => {
      it('should detect lab', () => {
        const result = analyzeSegment('npx lab test/', defaultOptions);
        expect(result.category).toBe('test');
        expect(result.isEssential).toBe(true);
      });

      it('should detect mocha', () => {
        const result = analyzeSegment('mocha test/**/*.js', defaultOptions);
        expect(result.category).toBe('test');
        expect(result.isEssential).toBe(true);
      });

      it('should detect jest', () => {
        const result = analyzeSegment('jest', defaultOptions);
        expect(result.category).toBe('test');
        expect(result.isEssential).toBe(true);
      });

      it('should detect vitest', () => {
        const result = analyzeSegment('vitest run', defaultOptions);
        expect(result.category).toBe('test');
        expect(result.isEssential).toBe(true);
      });

      it('should always mark test commands as essential', () => {
        const result = analyzeSegment('npm run test', defaultOptions);
        expect(result.category).toBe('test');
        expect(result.isEssential).toBe(true);
      });
    });

    describe('build command detection', () => {
      it('should detect webpack', () => {
        const result = analyzeSegment('webpack --config webpack.config.js', defaultOptions);
        expect(result.category).toBe('build');
        expect(result.isEssential).toBe(true);
      });

      it('should detect esbuild', () => {
        const result = analyzeSegment('esbuild src/index.ts', defaultOptions);
        expect(result.category).toBe('build');
        expect(result.isEssential).toBe(true);
      });

      it('should detect npm run build', () => {
        const result = analyzeSegment('npm run build', defaultOptions);
        expect(result.category).toBe('build');
        expect(result.isEssential).toBe(true);
      });

      it('should always mark build commands as essential', () => {
        const result = analyzeSegment('npm run compile', defaultOptions);
        expect(result.category).toBe('build');
        expect(result.isEssential).toBe(true);
      });
    });

    describe('other commands', () => {
      it('should mark unknown commands as essential', () => {
        const result = analyzeSegment('node scripts/setup.js', defaultOptions);
        expect(result.category).toBe('other');
        expect(result.isEssential).toBe(true);
      });
    });
  });

  describe('optimizeCommand', () => {
    const defaultOptions: OptimizationOptions = {
      skipLinting: true,
      skipCoverage: true,
      skipTypeCheck: true,
    };

    it('should remove linting from compound commands', () => {
      const result = optimizeCommand('npm run lint && npm test', defaultOptions);
      expect(result.optimizedCommand).toBe('npm test');
      expect(result.skippedSegments).toHaveLength(1);
      expect(result.skippedSegments[0].category).toBe('lint');
    });

    it('should remove type checking from compound commands', () => {
      const result = optimizeCommand('tsc --noEmit && vitest run', defaultOptions);
      expect(result.optimizedCommand).toBe('vitest run');
      expect(result.skippedSegments).toHaveLength(1);
      expect(result.skippedSegments[0].category).toBe('typecheck');
    });

    it('should remove multiple non-essential segments', () => {
      const result = optimizeCommand('eslint src && tsc --noEmit && vitest run', defaultOptions);
      expect(result.optimizedCommand).toBe('vitest run');
      expect(result.skippedSegments).toHaveLength(2);
    });

    it('should keep all segments when no optimizations enabled', () => {
      const noOptimizations: OptimizationOptions = {
        skipLinting: false,
        skipCoverage: false,
        skipTypeCheck: false,
      };
      const result = optimizeCommand('eslint src && npm test', noOptimizations);
      expect(result.optimizedCommand).toBe('eslint src && npm test');
      expect(result.skippedSegments).toHaveLength(0);
    });

    it('should keep build commands', () => {
      const result = optimizeCommand('npm run build && npm test', defaultOptions);
      expect(result.optimizedCommand).toBe('npm run build && npm test');
      expect(result.skippedSegments).toHaveLength(0);
    });

    it('should handle single command', () => {
      const result = optimizeCommand('npm test', defaultOptions);
      expect(result.optimizedCommand).toBe('npm test');
      expect(result.skippedSegments).toHaveLength(0);
    });

    it('should return original if all segments removed', () => {
      const result = optimizeCommand('eslint src', defaultOptions);
      // When no segments are kept, we fall back to the original
      expect(result.keptSegments).toHaveLength(0);
    });
  });

  describe('optimizePretestScript', () => {
    const defaultOptions: OptimizationOptions = {
      skipLinting: true,
      skipCoverage: true,
      skipTypeCheck: true,
    };

    it('should return null when pretest is only type checking', () => {
      const result = optimizePretestScript('tsc -p ./ --noEmit', defaultOptions);
      expect(result).toBeNull();
    });

    it('should return null when pretest is only linting', () => {
      const result = optimizePretestScript('eslint src --ext ts', defaultOptions);
      expect(result).toBeNull();
    });

    it('should return optimized command when pretest has essential segments', () => {
      const result = optimizePretestScript('tsc --noEmit && npm run build', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.optimizedCommand).toBe('npm run build');
    });

    it('should not modify pretest when no optimizations enabled', () => {
      const noOptimizations: OptimizationOptions = {
        skipLinting: false,
        skipCoverage: false,
        skipTypeCheck: false,
      };
      const result = optimizePretestScript('tsc --noEmit', noOptimizations);
      expect(result).not.toBeNull();
      expect(result!.optimizedCommand).toBe('tsc --noEmit');
    });
  });

  describe('removeCoverageFlags', () => {
    const optionsWithSkipCoverage: OptimizationOptions = {
      skipLinting: false,
      skipCoverage: true,
      skipTypeCheck: false,
    };

    const optionsWithoutSkipCoverage: OptimizationOptions = {
      skipLinting: false,
      skipCoverage: false,
      skipTypeCheck: false,
    };

    it('should remove --coverage flag', () => {
      const result = removeCoverageFlags('vitest run --coverage', optionsWithSkipCoverage);
      expect(result).toBe('vitest run');
    });

    it('should not modify command when skipCoverage is false', () => {
      const result = removeCoverageFlags('vitest run --coverage', optionsWithoutSkipCoverage);
      expect(result).toBe('vitest run --coverage');
    });

    it('should handle multiple coverage flags', () => {
      const result = removeCoverageFlags('jest --coverage --coverage-reporter text', optionsWithSkipCoverage);
      expect(result).toBe('jest');
    });

    it('should not affect other flags', () => {
      const result = removeCoverageFlags('vitest run --coverage --watch', optionsWithSkipCoverage);
      expect(result).toBe('vitest run --watch');
    });
  });

  describe('isPretestEssential', () => {
    it('should return false for tsc --noEmit only', () => {
      expect(isPretestEssential('tsc -p ./ --noEmit')).toBe(false);
    });

    it('should return false for linting only', () => {
      expect(isPretestEssential('eslint src')).toBe(false);
    });

    it('should return true for build commands', () => {
      expect(isPretestEssential('npm run build')).toBe(true);
    });

    it('should return true for mixed commands with build', () => {
      expect(isPretestEssential('tsc --noEmit && npm run build')).toBe(true);
    });

    it('should return true for unknown commands', () => {
      expect(isPretestEssential('node scripts/setup.js')).toBe(true);
    });
  });

  describe('describeOptimizations', () => {
    it('should list all skipped items', () => {
      const options: OptimizationOptions = {
        skipLinting: true,
        skipCoverage: true,
        skipTypeCheck: true,
      };
      const result = describeOptimizations(options);
      expect(result).toContain('linting');
      expect(result).toContain('coverage');
      expect(result).toContain('type checking');
    });

    it('should only list enabled skips', () => {
      const options: OptimizationOptions = {
        skipLinting: true,
        skipCoverage: false,
        skipTypeCheck: false,
      };
      const result = describeOptimizations(options);
      expect(result).toEqual(['linting']);
    });

    it('should return empty array when nothing skipped', () => {
      const options: OptimizationOptions = {
        skipLinting: false,
        skipCoverage: false,
        skipTypeCheck: false,
      };
      const result = describeOptimizations(options);
      expect(result).toEqual([]);
    });
  });

  describe('real-world scenarios', () => {
    const defaultOptions: OptimizationOptions = {
      skipLinting: true,
      skipCoverage: true,
      skipTypeCheck: true,
    };

    it('should optimize typical pretest: tsc -p ./ --noEmit', () => {
      const result = optimizePretestScript('tsc -p ./ --noEmit', defaultOptions);
      expect(result).toBeNull();
    });

    it('should optimize typical lint && test chain', () => {
      const result = optimizeCommand('npm run lint && npm run test', defaultOptions);
      expect(result.optimizedCommand).toBe('npm run test');
    });

    it('should optimize eslint && tsc && test chain', () => {
      const result = optimizeCommand('eslint . && tsc --noEmit && npm test', defaultOptions);
      expect(result.optimizedCommand).toBe('npm test');
      expect(result.skippedSegments).toHaveLength(2);
    });

    it('should keep build step in pretest', () => {
      const result = optimizePretestScript('tsc --noEmit && npm run build', defaultOptions);
      expect(result).not.toBeNull();
      expect(result!.optimizedCommand).toBe('npm run build');
    });

    it('should handle complex CI-style command', () => {
      const result = optimizeCommand(
        'npm run lint && npm run type-check && npm run build && npm test',
        defaultOptions
      );
      expect(result.optimizedCommand).toBe('npm run build && npm test');
      expect(result.skippedSegments).toHaveLength(2);
      expect(result.keptSegments).toHaveLength(2);
    });
  });
});

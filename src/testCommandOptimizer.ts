/**
 * @fileoverview Test command optimizer for Lab Test Explorer
 *
 * Analyzes and optimizes test commands by identifying and optionally skipping
 * non-essential components like linting, coverage, and type-checking to
 * speed up test execution.
 *
 * @module testCommandOptimizer
 */

/**
 * Categories of command components that can be skipped for faster test execution.
 */
export type SkippableCategory = 'lint' | 'coverage' | 'typecheck' | 'build';

/**
 * Options for optimizing test commands.
 */
export interface OptimizationOptions {
  skipLinting: boolean;
  skipCoverage: boolean;
  skipTypeCheck: boolean;
}

/**
 * Result of analyzing a command segment.
 */
export interface SegmentAnalysis {
  segment: string;
  category: SkippableCategory | 'test' | 'other';
  isEssential: boolean;
  reason?: string;
}

/**
 * Result of optimizing a command.
 */
export interface OptimizationResult {
  originalCommand: string;
  optimizedCommand: string;
  skippedSegments: SegmentAnalysis[];
  keptSegments: SegmentAnalysis[];
}

/**
 * Patterns that identify linting commands.
 */
const LINT_PATTERNS: RegExp[] = [
  /\beslint\b/i,
  /\btslint\b/i,
  /\bprettier\b/i,
  /\bbiome\s+(check|lint)\b/i,
  /\bstandardjs\b/i,
  /\bstandard\b(?!\s*version)/i,
  /\bxo\b/i,
  /\bjshint\b/i,
  /\bjslint\b/i,
  /\bnpm\s+run\s+lint\b/i,
  /\byarn\s+lint\b/i,
  /\bpnpm\s+(run\s+)?lint\b/i,
];

/**
 * Patterns that identify coverage commands or flags.
 */
const COVERAGE_PATTERNS: RegExp[] = [
  /\bnyc\b/i,
  /\bc8\b/i,
  /\bistanbul\b/i,
  /--coverage\b/i,
  /-c\s*(?=\s|$)/,  // standalone -c flag (coverage)
  /\bcoveralls\b/i,
  /\bcodecov\b/i,
  /\bnpm\s+run\s+(test:)?coverage\b/i,
  /\byarn\s+(test:)?coverage\b/i,
];

/**
 * Patterns that identify type-checking commands.
 */
const TYPECHECK_PATTERNS: RegExp[] = [
  /\btsc\b(?!\s+--build)/i,  // tsc but not tsc --build (which is a build command)
  /\btsc\s+(-p|--project)\b/i,
  /\btsc\s+--noEmit\b/i,
  /\btype-check\b/i,
  /\btypecheck\b/i,
  /\bnpm\s+run\s+(type-?check|types)\b/i,
  /\byarn\s+(type-?check|types)\b/i,
  /\bflow\s+check\b/i,
];

/**
 * Patterns that identify build commands (typically not skipped but tracked).
 */
const BUILD_PATTERNS: RegExp[] = [
  /\btsc\s+--build\b/i,
  /\bwebpack\b/i,
  /\besbuild\b/i,
  /\brollup\b/i,
  /\bvite\s+build\b/i,
  /\bparcel\s+build\b/i,
  /\bnpm\s+run\s+(build|compile)\b/i,
  /\byarn\s+(build|compile)\b/i,
];

/**
 * Patterns that identify actual test execution commands.
 * These should never be skipped.
 */
const TEST_PATTERNS: RegExp[] = [
  /\blab\b/i,
  /\bmocha\b/i,
  /\bjest\b/i,
  /\bvitest\b/i,
  /\bava\b/i,
  /\btap\b/i,
  /\btape\b/i,
  /\bnode\s+--test\b/i,
  /\bnpm\s+run\s+test(?!:)/i,  // npm run test but not npm run test:coverage
  /\byarn\s+test(?!:)/i,
];

/**
 * Splits a shell command into segments based on command separators.
 * Handles &&, ||, and ; while respecting quoted strings.
 *
 * @param command - The shell command to split
 * @returns Array of command segments with their separator type
 */
export function splitCommandIntoSegments(command: string): { segment: string; separator: string }[] {
  const segments: { segment: string; separator: string }[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < command.length) {
    const char = command[i];
    const nextChar = command[i + 1];

    // Handle quotes
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      i++;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      i++;
      continue;
    }

    // Skip separators inside quotes
    if (inSingleQuote || inDoubleQuote) {
      current += char;
      i++;
      continue;
    }

    // Check for separators
    if (char === '&' && nextChar === '&') {
      if (current.trim()) {
        segments.push({ segment: current.trim(), separator: '&&' });
      }
      current = '';
      i += 2;
      continue;
    }
    if (char === '|' && nextChar === '|') {
      if (current.trim()) {
        segments.push({ segment: current.trim(), separator: '||' });
      }
      current = '';
      i += 2;
      continue;
    }
    if (char === ';') {
      if (current.trim()) {
        segments.push({ segment: current.trim(), separator: ';' });
      }
      current = '';
      i++;
      continue;
    }

    current += char;
    i++;
  }

  // Add the last segment
  if (current.trim()) {
    segments.push({ segment: current.trim(), separator: '' });
  }

  return segments;
}

/**
 * Analyzes a command segment to determine its category and whether it's essential.
 *
 * The order of checks matters: coverage wrappers (nyc, c8) and coverage flags
 * are checked before test runners, since commands like "nyc mocha" contain
 * both patterns but should be categorized as coverage.
 *
 * @param segment - The command segment to analyze
 * @param options - Optimization options
 * @returns Analysis of the segment
 */
export function analyzeSegment(segment: string, options: OptimizationOptions): SegmentAnalysis {
  // Check for coverage first - commands like "nyc mocha" should be detected as coverage
  // Also catches flags like --coverage even on test commands
  for (const pattern of COVERAGE_PATTERNS) {
    if (pattern.test(segment)) {
      return {
        segment,
        category: 'coverage',
        isEssential: !options.skipCoverage,
        reason: options.skipCoverage ? 'Coverage skipped for faster test execution' : 'Coverage enabled',
      };
    }
  }

  // Check for linting
  for (const pattern of LINT_PATTERNS) {
    if (pattern.test(segment)) {
      return {
        segment,
        category: 'lint',
        isEssential: !options.skipLinting,
        reason: options.skipLinting ? 'Linting skipped for faster test execution' : 'Linting enabled',
      };
    }
  }

  // Check for type-checking
  for (const pattern of TYPECHECK_PATTERNS) {
    if (pattern.test(segment)) {
      return {
        segment,
        category: 'typecheck',
        isEssential: !options.skipTypeCheck,
        reason: options.skipTypeCheck ? 'Type checking skipped for faster test execution' : 'Type checking enabled',
      };
    }
  }

  // Check for build commands - these are generally kept
  for (const pattern of BUILD_PATTERNS) {
    if (pattern.test(segment)) {
      return {
        segment,
        category: 'build',
        isEssential: true,
        reason: 'Build command - required for test execution',
      };
    }
  }

  // Check for test commands - these are always essential
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(segment)) {
      return {
        segment,
        category: 'test',
        isEssential: true,
        reason: 'Test execution command',
      };
    }
  }

  // Unknown command - keep it to be safe
  return {
    segment,
    category: 'other',
    isEssential: true,
    reason: 'Unknown command - kept for safety',
  };
}

/**
 * Optimizes a test command by removing non-essential components.
 *
 * @param command - The original command to optimize
 * @param options - Optimization options
 * @returns The optimization result with original and optimized commands
 */
export function optimizeCommand(command: string, options: OptimizationOptions): OptimizationResult {
  const parsedSegments = splitCommandIntoSegments(command);
  const skippedSegments: SegmentAnalysis[] = [];
  const keptSegments: SegmentAnalysis[] = [];

  for (const { segment } of parsedSegments) {
    const analysis = analyzeSegment(segment, options);
    if (analysis.isEssential) {
      keptSegments.push(analysis);
    } else {
      skippedSegments.push(analysis);
    }
  }

  // Rebuild the command from kept segments
  // Use && as the default separator for kept segments
  const optimizedCommand = keptSegments.map((s) => s.segment).join(' && ');

  return {
    originalCommand: command,
    optimizedCommand: optimizedCommand || command, // Fall back to original if nothing kept
    skippedSegments,
    keptSegments,
  };
}

/**
 * Optimizes a pretest script by removing non-essential components.
 * Pretest scripts often contain type-checking or linting that isn't
 * strictly required for test execution.
 *
 * @param pretestScript - The pretest script from package.json
 * @param options - Optimization options
 * @returns The optimization result, or null if pretest should be skipped entirely
 */
export function optimizePretestScript(
  pretestScript: string,
  options: OptimizationOptions
): OptimizationResult | null {
  const result = optimizeCommand(pretestScript, options);

  // If all segments were skipped, return null to indicate pretest can be skipped
  if (result.keptSegments.length === 0) {
    return null;
  }

  return result;
}

/**
 * Removes coverage-related flags and arguments from a test command.
 * This handles cases where coverage is passed as a flag to the test runner
 * rather than as a separate command.
 *
 * @param command - The test command
 * @param options - Optimization options
 * @returns The command with coverage flags removed
 */
export function removeCoverageFlags(command: string, options: OptimizationOptions): string {
  if (!options.skipCoverage) {
    return command;
  }

  // Remove common coverage flags and their arguments
  // Order matters: remove flags with arguments first, then standalone flags
  let optimized = command
    // Remove --coverage-<option> <value> patterns (e.g., --coverage-reporter text)
    .replace(/\s+--coverage-\S+\s+\S+/g, '')
    // Remove --coverage-<option>=<value> patterns
    .replace(/\s+--coverage-\S+=\S+/g, '')
    // Remove standalone --coverage-<option> patterns
    .replace(/\s+--coverage-\S+/g, '')
    // Remove standalone --coverage flag
    .replace(/\s+--coverage\b/g, '')
    // Remove -c flag (coverage shorthand)
    .replace(/\s+-c\s*(?=\s|$)/g, ' ')
    // Remove --cov and related flags
    .replace(/\s+--cov\b\S*/g, '');

  // Clean up any double spaces
  optimized = optimized.replace(/\s+/g, ' ').trim();

  return optimized;
}

/**
 * Determines if a pretest script is essential for test execution.
 * Some pretest scripts compile code that is required for tests to run,
 * while others just perform checks.
 *
 * @param pretestScript - The pretest script to analyze
 * @returns true if the pretest appears to be essential
 */
export function isPretestEssential(pretestScript: string): boolean {
  // If it's just type-checking with --noEmit, it's not essential
  if (/\btsc\b.*--noEmit\b/.test(pretestScript)) {
    const segments = splitCommandIntoSegments(pretestScript);
    // If the only segments are tsc --noEmit, it's not essential
    const nonTypeCheckSegments = segments.filter(({ segment }) => {
      return !TYPECHECK_PATTERNS.some((pattern) => pattern.test(segment));
    });
    return nonTypeCheckSegments.length > 0;
  }

  // Check if it includes actual build steps
  for (const pattern of BUILD_PATTERNS) {
    if (pattern.test(pretestScript)) {
      return true;
    }
  }

  // If it's purely linting, it's not essential
  const segments = splitCommandIntoSegments(pretestScript);
  const hasNonLintSegment = segments.some(({ segment }) => {
    return !LINT_PATTERNS.some((pattern) => pattern.test(segment));
  });

  return hasNonLintSegment;
}

/**
 * Describes what will be skipped when running with given options.
 * Useful for user feedback in the test output.
 *
 * @param options - The optimization options
 * @returns A human-readable description of what will be skipped
 */
export function describeOptimizations(options: OptimizationOptions): string[] {
  const descriptions: string[] = [];

  if (options.skipLinting) {
    descriptions.push('linting');
  }
  if (options.skipCoverage) {
    descriptions.push('coverage');
  }
  if (options.skipTypeCheck) {
    descriptions.push('type checking');
  }

  return descriptions;
}

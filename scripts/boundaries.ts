import { execFileSync } from 'node:child_process';

const GLOBS = ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'];
const CONFIG = '.dependency-cruiser.cjs';

interface CruiseResult {
  summary: { totalCruised: number; totalDependenciesCruised: number; violations: unknown[] };
}

function depcruise(args: string[]): { stdout: string; failed: boolean } {
  try {
    return {
      stdout: execFileSync('node_modules/.bin/depcruise', args, { encoding: 'utf8' }),
      failed: false,
    };
  } catch (error) {
    const { stdout } = error as { stdout?: string };
    if (stdout === undefined) throw error;
    return { stdout, failed: true };
  }
}

const { stdout } = depcruise([...GLOBS, '--config', CONFIG, '--output-type', 'json']);
const { summary } = JSON.parse(stdout) as CruiseResult;

// A cruise that collects no file reports no violation. Without this the gate is green precisely
// when the guard has stopped looking, which is the failure this repository exists to rule out.
if (summary.totalCruised === 0) {
  console.error(
    `The boundary rule matched no file (globs: ${GLOBS.join(', ')}).\n` +
      'The guard is not looking at anything, so a green result proves nothing.',
  );
  process.exit(1);
}

if (summary.violations.length > 0) {
  console.error(depcruise([...GLOBS, '--config', CONFIG, '--output-type', 'err']).stdout);
  process.exit(1);
}

console.log(
  `✔ boundaries: ${String(summary.totalCruised)} modules, ` +
    `${String(summary.totalDependenciesCruised)} dependencies, no violation.`,
);

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GLOBS = ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'];
const TIERS = ['packages', 'apps'];
const CONFIG = '.dependency-cruiser.cjs';

interface CruiseResult {
  modules: { source: string }[];
  summary: { totalCruised: number; totalDependenciesCruised: number; violations: unknown[] };
}

/**
 * Every directory of `packages/` and `apps/` that carries a manifest — the members the globs above
 * are meant to reach. The fixture directories are skipped because `options.exclude` in the cruiser
 * config removes them on purpose: asserting they were cruised would assert the opposite of what
 * the configuration says.
 */
function workspaceMembers(): string[] {
  return TIERS.flatMap((tier) =>
    readdirSync(tier, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.includes('__boundary-fixture__'))
      .map((entry) => `${tier}/${entry.name}`)
      .filter((member) => existsSync(join(member, 'package.json'))),
  );
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
const { modules, summary } = JSON.parse(stdout) as CruiseResult;

// A cruise that collects no file reports no violation. Without this the gate is green precisely
// when the guard has stopped looking, which is the failure this repository exists to rule out.
if (summary.totalCruised === 0) {
  console.error(
    `The boundary rule matched no file (globs: ${GLOBS.join(', ')}).\n` +
      'The guard is not looking at anything, so a green result proves nothing.',
  );
  process.exit(1);
}

// The check above is global, and `packages/` alone keeps it non-zero. That is how a whole
// workspace member can go uncruised with a green gate — `apps/api/lib/**` instead of
// `apps/api/src/**`, and the app the boundary exists to constrain is the one file nobody looked
// at. Asserting per member is the same guard at the granularity the globs actually operate on.
const members = workspaceMembers();
if (members.length === 0) {
  console.error(
    `Found no workspace member under ${TIERS.join(', ')}.\n` +
      'The per-member check below would then assert nothing at all.',
  );
  process.exit(1);
}

const uncruised = members.filter(
  (member) => !modules.some(({ source }) => source.startsWith(`${member}/`)),
);
if (uncruised.length > 0) {
  console.error(
    `These workspace members carry a manifest and were cruised in no file:\n` +
      uncruised.map((member) => `  ✖ ${member}`).join('\n') +
      `\nEither the member has no source, or its layout escapes the globs ` +
      `(${GLOBS.join(', ')}). Both make its result green by omission.`,
  );
  process.exit(1);
}

if (summary.violations.length > 0) {
  console.error(depcruise([...GLOBS, '--config', CONFIG, '--output-type', 'err']).stdout);
  process.exit(1);
}

console.log(
  `✔ boundaries: ${String(summary.totalCruised)} modules across ${String(members.length)} ` +
    `workspace members, ${String(summary.totalDependenciesCruised)} dependencies, no violation.`,
);

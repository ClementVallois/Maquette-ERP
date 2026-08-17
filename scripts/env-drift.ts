/**
 * The drift rules between `.env.example`, `.env` and `compose.yml`, as a pure function of their
 * contents. `check-env.ts` reads the files and reports; everything decidable lives here so it can
 * be tested against strings instead of against the machine it happens to run on.
 */

export const EXAMPLE = '.env.example';
export const LOCAL = '.env';
export const COMPOSE = 'compose.yml';

export interface EnvSources {
  example: string;
  compose: string;
  /** `undefined` when no `.env` exists. That is a finding, not a reason to check less. */
  local: string | undefined;
}

export function declaredKeys(contents: string): Set<string> {
  const keys = contents
    .split('\n')
    .map((line) => /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);

  return new Set(keys);
}

/**
 * Only `${VAR:?...}` and `${VAR}`. Compose also expands `$$VAR` inside the container, which is
 * deliberately NOT a host variable — the healthcheck relies on that difference.
 */
export function composeReferences(contents: string): Set<string> {
  const found = contents.replaceAll('$$', '').matchAll(/\$\{([A-Z_][A-Z0-9_]*)[:?}]/gu);

  return new Set([...found].map((match) => match[1]).filter((name) => name !== undefined));
}

export function envProblems({ example, compose, local }: EnvSources): string[] {
  const problems: string[] = [];
  const declared = declaredKeys(example);
  const referenced = composeReferences(compose);

  // The self-check, and it comes first for the same reason `boundaries.ts` asserts
  // `totalCruised > 0`: if the parse stops matching — compose refactored to bare `$VAR`, the file
  // renamed — every check below passes vacuously and the run prints that all three sources agree.
  // A guard that has stopped looking must fail, not congratulate itself.
  if (referenced.size === 0) {
    problems.push(
      `Read no \`\${VAR}\` at all out of ${COMPOSE}. Either it stopped using them, or this ` +
        'check stopped seeing them — and the second one is green by accident.',
    );
  }
  if (declared.size === 0) {
    problems.push(`Read no variable at all out of ${EXAMPLE}. Same reasoning as above.`);
  }

  // Drift 1. The one that bites today: a variable added to compose.yml with no line in the
  // template. `docker compose up` then stops on `:?` with a message about a file nobody edited.
  for (const name of referenced) {
    if (!declared.has(name)) {
      problems.push(`${COMPOSE} needs ${name}, and ${EXAMPLE} does not declare it.`);
    }
  }

  // Drift 2 and 3 need a local .env. Absent, this is not "nothing to check" — it is the same
  // unconfigured state compose refuses to start in, so it reads the same way here.
  if (local === undefined) {
    problems.push(`No ${LOCAL}. Run \`pnpm run env:init\`.`);
    return problems;
  }

  const configured = declaredKeys(local);

  for (const name of declared) {
    if (!configured.has(name)) {
      problems.push(`${LOCAL} is missing ${name}, added to ${EXAMPLE} since it was copied.`);
    }
  }
  for (const name of configured) {
    if (!declared.has(name)) {
      problems.push(`${LOCAL} sets ${name}, which ${EXAMPLE} does not document.`);
    }
  }

  return problems;
}

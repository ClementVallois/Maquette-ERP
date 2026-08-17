import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXAMPLE = '.env.example';
const LOCAL = '.env';
const COMPOSE = 'compose.yml';

function keysOf(file: string): Set<string> {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  const keys = lines
    .map((line) => /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);

  return new Set(keys);
}

// Only `${VAR:?...}` and `${VAR}`. Compose also expands `$$VAR` inside the container, which is
// deliberately NOT a host variable — the healthcheck relies on that difference.
function composeReferences(): Set<string> {
  const text = readFileSync(join(root, COMPOSE), 'utf8').replaceAll('$$', '');
  const found = text.matchAll(/\$\{([A-Z_][A-Z0-9_]*)[:?}]/g);

  return new Set([...found].map((match) => match[1]).filter((name) => name !== undefined));
}

const problems: string[] = [];

const example = keysOf(EXAMPLE);

// Drift 1. The one that bites today: a variable added to compose.yml with no line in the
// template. `docker compose up` then stops on `:?` with a message about a file nobody edited.
for (const name of composeReferences()) {
  if (!example.has(name)) {
    problems.push(`${COMPOSE} needs ${name}, and ${EXAMPLE} does not declare it.`);
  }
}

// Drift 2 and 3 need a local .env. Absent, this is not "nothing to check" — it is the same
// unconfigured state compose refuses to start in, so it reads the same way here.
if (!existsSync(join(root, LOCAL))) {
  problems.push(`No ${LOCAL}. Run \`pnpm run env:init\`.`);
} else {
  const local = keysOf(LOCAL);

  for (const name of example) {
    if (!local.has(name)) {
      problems.push(`${LOCAL} is missing ${name}, added to ${EXAMPLE} since it was copied.`);
    }
  }
  for (const name of local) {
    if (!example.has(name)) {
      problems.push(`${LOCAL} sets ${name}, which ${EXAMPLE} does not document.`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `  ✖ ${problem}`).join('\n'));
  process.exit(1);
}

console.log(
  `✔ env: ${String(example.size)} variables, ${EXAMPLE} agrees with ${LOCAL} and ${COMPOSE}.`,
);

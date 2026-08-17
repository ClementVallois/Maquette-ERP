import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPOSE, EXAMPLE, LOCAL, declaredKeys, envProblems } from './env-drift.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(join(root, file), 'utf8');

const example = read(EXAMPLE);
const problems = envProblems({
  example,
  compose: read(COMPOSE),
  local: existsSync(join(root, LOCAL)) ? read(LOCAL) : undefined,
});

if (problems.length > 0) {
  console.error(problems.map((problem) => `  ✖ ${problem}`).join('\n'));
  process.exit(1);
}

console.log(
  `✔ env: ${String(declaredKeys(example).size)} variables, ` +
    `${EXAMPLE} agrees with ${LOCAL} and ${COMPOSE}.`,
);

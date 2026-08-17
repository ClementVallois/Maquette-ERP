export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // A closed list. A commit that finds no scope signals either an undeclared module or a
    // change crossing the boundary — which is what this repository exists to make visible.
    'scope-enum': [
      2,
      'always',
      [
        'repo',
        'workspace',
        'typescript',
        'lint',
        'boundaries',
        'ci',
        'deps',
        'test',
        'docker',
        'db',
        'docs',
        'adr',
        'platform',
        'contracts',
        'timesheet',
        'billing',
        // Extended once, in task 0.2 of docs/BUILD-PLAN.md, for the scopes phases 4-8 will need.
        // Adding them ahead of the code is the point: the alternative is a `--no-verify` on the
        // first commit of every one of those phases, which turns the closed list into a formality.
        'api',
        'web',
        'seed',
        'deploy',
        'security',
      ],
    ],
    'body-max-line-length': [2, 'always', 100],
  },
};

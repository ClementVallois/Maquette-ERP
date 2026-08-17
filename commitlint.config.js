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
        'api',
        'web',
      ],
    ],
    'body-max-line-length': [2, 'always', 100],
  },
};

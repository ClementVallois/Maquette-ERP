/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'billing-not-to-timesheet',
      severity: 'error',
      comment:
        'billing must not reach into timesheet. It reacts to the timesheet.TimesheetValidated ' +
        'event, whose contract lives in @erp/platform. See docs/adr/0001.',
      from: { path: '^packages/billing/' },
      to: { path: '^packages/timesheet/' },
    },
    {
      name: 'timesheet-not-to-billing',
      severity: 'error',
      comment:
        'timesheet must not know that billing exists. It publishes an event and ignores who ' +
        'listens. See docs/adr/0001.',
      from: { path: '^packages/timesheet/' },
      to: { path: '^packages/billing/' },
    },
    {
      name: 'platform-depends-on-nothing-local',
      severity: 'error',
      comment: 'The shared kernel is downstream of no module.',
      from: { path: '^packages/platform/' },
      to: { path: '^(packages/(timesheet|billing|contracts)|apps)/' },
    },
    {
      name: 'domain-has-no-external-dependency',
      severity: 'error',
      comment:
        'The domain is plain TypeScript: no framework, no ORM, no network, no disk — not even a ' +
        'Node builtin. A legitimate need gets declared here explicitly. CLAUDE.md rule 3.',
      from: { path: '^packages/[^/]+/src/domain/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'core'] },
    },
    {
      name: 'domain-not-to-outer-layers',
      severity: 'error',
      comment: 'The domain does not know its callers.',
      from: { path: '^packages/[^/]+/src/domain/' },
      to: { path: '^packages/[^/]+/src/(application|infrastructure)/' },
    },
    {
      name: 'application-not-to-infrastructure',
      severity: 'error',
      comment: 'Application depends on ports, never on their adapters.',
      from: { path: '^packages/[^/]+/src/application/' },
      to: { path: '^packages/[^/]+/src/infrastructure/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],

  // The whitelist. Everything above names a specific arrow so the failure reads well; this is
  // what makes an UNDECLARED arrow fail too. Without it the rules are a blacklist, and a module
  // added tomorrow reaches into any other one with a green gate. See docs/adr/0001.
  allowedSeverity: 'error',
  allowed: [
    // Inside one package. `$1` is the capture group from `from.path`.
    { from: { path: '^packages/([^/]+)/' }, to: { path: '^packages/$1/' } },
    // The two modules may use the shared kernel, and only through its public entry point.
    {
      from: { path: '^packages/(timesheet|billing)/' },
      to: { path: '^packages/platform/src/index\\.ts$' },
    },
    // Third-party code. The domain is held to nothing at all by a separate forbidden rule.
    { from: {}, to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'core'] } },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // pnpm links workspace deps into each package's node_modules, so a glob otherwise collects
    // packages/billing/node_modules/@erp/platform/** and attributes platform's files to billing.
    // The fixture is a deliberate violation, kept alive to test the rule itself:
    // see packages/billing/src/__boundary-fixture__/README.md
    exclude: { path: '(^|/)node_modules/|__boundary-fixture__' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};

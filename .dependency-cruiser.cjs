const path = require('node:path');

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
      name: 'contracts-has-no-business-dependency',
      severity: 'error',
      comment:
        'The wire contract both apps read is not a place either module reaches back into. A ' +
        'DTO copies a shape at the boundary; it does not import the domain that produces it. ' +
        'Package 09 of docs/clean-up-audit.consolidated.local.md makes this a named rule rather ' +
        'than the closed whitelist below enforcing it silently.',
      from: { path: '^packages/contracts/' },
      to: { path: '^packages/(timesheet|billing)/' },
    },
    {
      name: 'domain-has-no-external-dependency',
      severity: 'error',
      comment:
        'The domain is plain TypeScript: no framework, no ORM, no network, no disk — not even a ' +
        'Node builtin. A legitimate need gets declared here explicitly. CLAUDE.md rule 3.',
      // The shared kernel contains domain-grade code; colocated tests may import their runner.
      from: {
        path: '^packages/(?:[^/]+/src/domain|platform/src)/',
        pathNot: '\\.test\\.ts$',
      },
      // `npm-no-pkg` catches imports absent from the importing package's manifest. The boundary
      // fixtures prove this case independently from declared development dependencies.
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'core'],
      },
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
      name: 'no-module-to-app',
      severity: 'error',
      comment:
        'An app composes modules; a module does not know it is deployed, or by what. The reverse ' +
        'arrow is what lets a domain rule end up depending on a screen. See docs/adr/0015.',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
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
    // Inside one app.
    { from: { path: '^apps/([^/]+)/' }, to: { path: '^apps/$1/' } },
    // An app composes modules through their public entry point, and reaches nothing behind it.
    // This is the only granted arrow between the two tiers; `no-module-to-app` names the reverse
    // one so its failure reads well, and this entry is what refuses everything else.
    { from: { path: '^apps/' }, to: { path: '^packages/[^/]+/src/index\\.ts$' } },
    // Third-party code. The domain is held to nothing at all by a separate forbidden rule.
    // `npm-no-pkg` is what dependency-cruiser reports when the IMPORTING package's manifest does
    // not declare the package — not, as this comment used to say, a pnpm symlink it cannot
    // resolve. The two modules now declare `pg` themselves, so their imports classify as `npm`;
    // this entry stays for a root-only devDependency reached from repository tooling.
    {
      from: {},
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-no-pkg', 'core'] },
    },
    // Integration tests live in `packages/*/src/` (boundary rules apply) but import a shared
    // harness outside of any package. The harness files also import each other.
    { from: { path: '\\.int\\.test\\.ts$' }, to: { path: '^tests/' } },
    { from: { path: '^tests/' }, to: { path: '^tests/' } },
    // Scripts are composition roots and may use only application and package public surfaces.
    { from: { path: '^scripts/' }, to: { path: '^packages/[^/]+/src/index\\.ts$' } },
    { from: { path: '^scripts/' }, to: { path: '^apps/[^/]+/src/index\\.ts$' } },
    { from: { path: '^scripts/' }, to: { path: '^scripts/' } },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // Exclude pnpm's linked workspace copies, but keep external packages in the graph so the
    // domain dependency rule can see them. Boundary fixtures are tested separately.
    exclude: { path: '(^|/)packages/[^/]+/node_modules/|__boundary-fixture__' },
    // Use the web tsconfig so dependency-cruiser resolves the SPA's `@/` alias. An absolute path
    // is required for TypeScript to resolve that config's `extends` chain correctly.
    tsConfig: { fileName: path.resolve(__dirname, 'apps/web/tsconfig.json') },
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

# Boundary fixture — an undeclared module

`undeclared-module` is a package that was never granted a right to depend on anything. It reaches
into `timesheet`'s internals on purpose, and is excluded from the normal `pnpm run boundaries` run.

It guards the property that the named rules cannot guard on their own. Those rules forbid specific
arrows; this one proves the default is _deny_, so a module added tomorrow is refused until someone
declares its right — which is what `docs/adr/0001` claims.

That claim was false for a while: the config held only `forbidden` rules, so this exact file passed
the gate. `boundary-rule.test.ts` now asserts it is rejected.

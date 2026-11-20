---
type: feat!
packages:
  - "@sekhmet/schema"
---

parse(schema, { input, panics }) runs under a panic runtime and returns Vow<Outcome<O, E, unknown>>: a throw or rejection in user code is Panicked, an expected failure Err. Potential (Sync, Async, from, mapPotential, PotentialVariants) and parseAsync are removed (use wait(parse(…))); a schema holds a Runner (SchemaParams.run; new Schema({ parse }) or { run }); toStandard takes panics (#84)

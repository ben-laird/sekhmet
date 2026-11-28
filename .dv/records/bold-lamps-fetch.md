---
type: feat!
packages:
  - "@sekhmet/schema"
---

parseSync(schema, { input, panics }) and is(schema, { panics }) take a required panic runtime, like parse; main's method is schema.parseSync({ input, panics }). A throw while parseSync runs still unwinds to its caller, but what is left of an abandoned async parse now runs under panics: a panic there is reported once and settles Panicked, instead of being caught unreported (#114)

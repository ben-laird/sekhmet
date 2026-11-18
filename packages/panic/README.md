# @sekhmet/panic

Rust-style panics for TypeScript. `@sekhmet/panic` gives you a structured
`Panic` for broken invariants, and a **panic runtime** that splits reporting a
panic (the panic hook) from recovering from one (`catchUnwind`), the way Rust's
`std::panic` does.

In Sekhmet, errors are values (`Result`), and `throw` means panic.

## Features

1. **Reporting and recovery are separate.** The hook only reports; the
   boundary recovers and hands you a `Result`.
2. **No global state.** There is no default runtime and no module-level hook.
   You create a runtime and run your program inside it.
3. **Reported once per runtime.** Each runtime reports a thrown `Panic` (or
   any other object) once, however many of its boundaries it passes through.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/panic).

```sh
deno add jsr:@sekhmet/panic
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/panic      # npm
pnpm dlx jsr add @sekhmet/panic # pnpm
yarn dlx jsr add @sekhmet/panic # yarn
bunx jsr add @sekhmet/panic     # bun
```

## Example

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { Err } from "@sekhmet/enum/result/mini/core";
import { mapErr } from "@sekhmet/enum/result/mini/transform";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();

function main(): number {
	panic({ message: "config is missing a port", cause: null });
}

// Every throw inside main is reported once (to console.error by default),
// then returned as Err
const result = mapErr(runtime.catchUnwind(main), (payload) => {
	return payload instanceof Panic ? payload.message : "unknown failure";
});

assertEquals(result, Err("config is missing a port"));
```

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) runs a program in
  a runtime, panics, watches the hook report it and recovers with a fallback.
- **How-to guides:** [Recipes](./docs/recipes.md) for running a program in a
  runtime, reporting to a logger, chaining hooks, turning a panic into an app
  error, recovering from async work, passing a panic to an outer boundary,
  attaching a cause, keeping your own metadata about panics and recognizing a
  hook that failed.
- **Explanation:** [Concepts](./docs/concepts.md) covers panics versus error
  values, why reporting and recovery are separate, one runtime per program
  with no global state, why each panic is reported once per runtime, and what
  happens when the hook throws.
- **Reference:** the [API reference on JSR](https://jsr.io/@sekhmet/panic/doc)
  documents every export and maps each Rust `std::panic` item to its
  counterpart.

The guides are also on the
[docs site](https://ben-laird.github.io/sekhmet/panic/).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/panic/LICENSE.md).

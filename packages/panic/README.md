# @sekhmet/panic

Rust-style panics for TypeScript. `@sekhmet/panic` gives you a structured
`Panic` for broken invariants, and a **panic runtime** that splits reporting a
panic (the panic hook) from recovering from one (`catchUnwind`), the way Rust's
`std::panic` does.

In Sekhmet, errors are values (`Result`), and `throw` means panic.

## Features

1. **Reporting and recovery are separate.** The hook only reports; the
   boundary recovers and hands you a `Vow` of an `Outcome`, which keeps a
   caught panic apart from an expected error. Sync work settles that vow
   before `catchUnwind` returns, and async work settles it later.
2. **No global state.** There is no default runtime and no module-level hook.
   You create a runtime and run your program inside it.
3. **Reported once per runtime.** Each runtime reports a thrown `Panic` (or
   any other object) once, however many of its boundaries it passes through.
4. **Bugs stay apart from expected errors.** `Outcome<T, E, P>`
   (`@sekhmet/panic/outcome`) holds `Ok(T)`, an expected `Err(E)` or
   `Panicked(P)`. Its ordinary combinators pass a panic through untouched, so
   handling an expected error never swallows a bug.

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
import { Err as ResultErr } from "@sekhmet/enum/result/mini/core";
import { intoInner } from "@sekhmet/enum/either/mini";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { Err, mapErr, recover } from "@sekhmet/panic/outcome/mini";
import { poll } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();

function main(): number {
	panic({ message: "config is missing a port", cause: null });
}

// Every throw inside main is reported once (to console.error by default),
// then settled as Panicked; main is sync, so the vow is settled at once.
// recover turns the panic into an app error, kept in an Either apart from
// the outcome's own errors; a boundary has none.
const exit = expectReady(poll(runtime.catchUnwind(main)), "main is sync");
const recovered = recover(exit, (payload) => {
	return ResultErr(
		payload instanceof Panic ? payload.message : "unknown failure",
	);
});
const result = mapErr(recovered, intoInner);

assertEquals(result, Err("config is missing a port"));
```

### Outcome

```ts
import { Err, Ok, type Outcome, Panicked } from "@sekhmet/panic/outcome";
import { assertEquals, assertThrows } from "@std/assert";

const failed: Outcome<number, string> = Err("not found");
const bug: Outcome<number, string> = Panicked(new RangeError("too big"));

const next = Ok(20).map((n) => n + 1);

assertEquals(next.unwrapOr(0), 21);
// A fallback stands in for an expected error...
assertEquals(failed.unwrapOr(0), 0);
// ...but never for a bug: the panic is thrown again
assertThrows(() => bug.unwrapOr(0), RangeError, "too big");
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
  values, why reporting and recovery are separate, how `Outcome` keeps bugs
  apart from expected errors, one runtime per program
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

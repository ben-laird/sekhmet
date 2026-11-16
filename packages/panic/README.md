# Panic

Rust-style panics for TypeScript. `@sekhmet/panic` gives you a structured
`Panic` for broken invariants, and a **panic runtime** that splits reporting a
panic (the panic hook) from recovering from one (`catchUnwind`), the way Rust's
`std::panic` does.

In Sekhmet, errors are values (`Result`), and `throw` means panic: something
happened that cannot happen unless the program is wrong.

## Features

1. **Reporting and recovery are separate.** The hook only reports; the
   boundary recovers and hands you a `Result`.
2. **No global state.** There is no default runtime and no module-level hook.
   You create a runtime and run your program inside it.
3. **Reported once per runtime.** Each runtime reports a payload at its
   innermost boundary that catches it, and never again, however many of its
   boundaries the payload passes through.

## Installation

### Deno

```bash
deno add jsr:@sekhmet/panic
```

### Node, Bun and other npm-compatible tools

```bash
npx jsr add @sekhmet/panic
```

## Run your program inside a runtime

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
const result = mapErr(runtime.catchUnwind(main), (payload) =>
	payload instanceof Panic ? payload.message : "unknown failure",
);

assertEquals(result, Err("config is missing a port"));
```

`catchUnwind` catches **every** throw, not only `Panic`s. The `Err` holds the
thrown value unchanged, typed `unknown`; narrow it with `instanceof Panic`. For
async work, use `catchUnwindAsync`, which catches both a rejection and a
synchronous throw from the function you pass.

## Rust mapping

| Rust (`std::panic`) | `@sekhmet/panic`                                   |
| ------------------- | -------------------------------------------------- |
| `panic!`            | `panic(source)` / `panicWithoutCause(source)`      |
| `set_hook`          | `runtime.setHook(hook)`                            |
| `take_hook`         | `runtime.takeHook()` (restores `defaultPanicHook`) |
| `PanicHookInfo`     | `PanicHookInfo` (`payload`, `stack`)               |
| `catch_unwind`      | `runtime.catchUnwind(fn)` / `catchUnwindAsync(fn)` |
| `resume_unwind`     | `runtime.resumeUnwind(payload)`                    |
| `Box<dyn Any>`      | `unknown`                                          |

Two differences follow from having no global state:

- **The hook runs at the boundary, not at the throw, once per runtime.** Rust
  calls its one global hook when `panic!` runs. Here each runtime keeps a
  private record of the object payloads it has reported or resumed: its
  innermost `catchUnwind` that catches an unwind reports it, and no other
  boundary of that runtime reports it again. Every other runtime the payload
  passes through, such as a library's own runtime, reports it once through its
  own hook; one runtime can never silence another. Payloads are never mutated.
  Primitives (strings, `undefined` and so on) can't be recorded, so every
  boundary that catches one reports it: throw `Panic`s.
- **A throwing hook does not abort.** Rust aborts on a panic while panicking.
  Here the boundary gives up recovering and throws a `Panic (PanicHook)` whose
  cause holds the original payload and what the hook threw; an outer boundary
  reports and catches it. Recognize it with `isPanicHookFailure(payload)`.

See [the guide](./docs/guide.md) for hooks, chaining, nested boundaries and
converting payloads into app errors.

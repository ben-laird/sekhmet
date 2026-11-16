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
3. **Reported once.** Each payload is reported by the innermost boundary that
   catches it, however many boundaries or runtimes it passes through.

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

```ts ignore
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { mapErr } from "@sekhmet/enum/result/mini/transform";

const runtime = definePanicRuntime();

function main(): number {
	panic({ message: "config is missing a port", cause: null });
}

// Every throw inside main is reported once, then returned as Err
const result = mapErr(runtime.catchUnwind(main), (payload) =>
	payload instanceof Panic ? payload.message : "unknown failure",
);
```

`catchUnwind` catches **every** throw, not only `Panic`s. The `Err` holds the
thrown value unchanged, typed `unknown`; narrow it with `instanceof Panic`. For
async work, use `catchUnwindAsync`, which catches both a rejection and a
synchronous throw from the function you pass.

## Rust mapping

| Rust (`std::panic`) | `@sekhmet/panic`                                    |
| ------------------- | --------------------------------------------------- |
| `panic!`            | `panic(source)` / `panicWithoutCause(source)`       |
| `set_hook`          | `runtime.setHook(hook)`                             |
| `take_hook`         | `runtime.takeHook()` (restores `defaultPanicHook`)  |
| `PanicHookInfo`     | `PanicHookInfo` (`payload`, `stack`)                |
| `catch_unwind`      | `runtime.catchUnwind(fn)` / `catchUnwindAsync(fn)`  |
| `resume_unwind`     | `runtime.resumeUnwind(payload)`                     |
| `Box<dyn Any>`      | `unknown`                                           |

Two differences follow from having no global state:

- **The hook runs at the boundary, not at the throw.** Rust calls the hook when
  `panic!` runs. Here the innermost `catchUnwind` that catches the unwind
  reports it, and marks the payload so no other boundary reports it again.
  Payloads that cannot carry that mark (primitives, and frozen or otherwise
  non-extensible objects) are reported by every boundary that catches them, so
  throw `Panic`s.
- **A throwing hook does not abort.** Rust aborts on a panic while panicking.
  Here the boundary gives up recovering and throws a `Panic (PanicHook)` whose
  cause holds the original payload and what the hook threw; an outer boundary
  reports and catches it.

See [the guide](./docs/guide.md) for hooks, chaining, nested boundaries and
converting payloads into app errors.

# @sekhmet/dispatch

A typed, one-shot signal: `AbortController`/`AbortSignal` with a typed value
instead of `reason: any`, and the same class shape. A `DispatchController<T>`
**dispatches** a value once; its `DispatchSignal<T>` can only be read. The
first dispatch wins, a listener added after it still runs, and a throwing
listener is a panic reported to your panic runtime's hook instead of breaking
the dispatch.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/dispatch).

```sh
deno add jsr:@sekhmet/dispatch
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/dispatch      # npm
pnpm dlx jsr add @sekhmet/dispatch # pnpm
yarn dlx jsr add @sekhmet/dispatch # yarn
bunx jsr add @sekhmet/dispatch     # bun
```

## Example

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { isNone, Some } from "@sekhmet/enum/option/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";

type Cause =
	| { readonly kind: "done" }
	| { readonly kind: "cancelled"; readonly by: string };
// {}

const runtime = definePanicRuntime();
const end = new DispatchController<Cause>(runtime.catchUnwind);

const log: string[] = [];
end.signal.whenDispatched((cause) => {
	log.push(`ended: ${cause.kind}`);
});
const forFetch = end.signal.toAbortSignal();

assert(isNone(end.dispatch({ kind: "cancelled", by: "user" })));
assertEquals(
	end.dispatch({ kind: "done" }), // too late: the first dispatch wins
	Some({ kind: "cancelled", by: "user" }),
);

end.signal.whenDispatched((cause) => {
	log.push(`late listener: ${cause.kind}`); // runs at once
});

assertEquals(log, ["ended: cancelled", "late listener: cancelled"]);
assertEquals(forFetch.reason, { kind: "cancelled", by: "user" });
```

## API

| Export                                                    | Does                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `new DispatchController<T>(catchUnwind)`                  | the write side; its listeners run inside `catchUnwind`             |
| `controller.dispatch(value)`                              | dispatches once: `None` if this call did, `Some(first)` if not     |
| `controller.signal`                                       | the read side, a `DispatchSignal<T>`                               |
| `signal.poll()`                                           | `Ready(value)` once dispatched, `Pending` before                   |
| `signal.whenDispatched(listener)`                         | runs `listener` on dispatch, or at once; returns an `Unsubscribe`  |
| `signal.map(f)`, `signal.zip(other)`                      | a signal of `f(value)`, or of both values once both dispatch       |
| `DispatchSignal.any(signals)`                             | a signal of the first value dispatched; `any([])` never dispatches |
| `DispatchSignal.dispatched({ value, catchUnwind })`       | a signal already dispatched with `value`                           |
| `DispatchSignal.never()`                                  | a signal that never dispatches                                     |
| `signal.wait()`, `signal.toVow()`                         | the value as a `Promise`, or as a new `Vow`                        |
| `signal.toAbortSignal()`                                  | an `AbortSignal` that aborts with the value                        |
| `DispatchSignal.fromAbortSignal({ signal, catchUnwind })` | a signal of an `AbortSignal`'s abort reason                        |

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) builds a
  cancellable download step by step: a typed end cause, listeners, the
  first-wins rule, a timeout raced against the user, and a bridge to `fetch`.
- **How-to guides:** [Recipes](./docs/recipes.md) for cancelling `fetch` with
  a typed reason, racing signals, waiting for two signals, adapting an
  `AbortSignal`, awaiting a signal, handing out a finished signal, and
  catching throwing listeners.
- **Explanation:** [Concepts](./docs/concepts.md) covers why a typed signal
  rather than an `AbortSignal`, the two capabilities, why the first dispatch
  wins and `dispatch` returns an `Option`, listeners that never miss it,
  throwing listeners as panics, and why derived signals hold no
  subscription.
- **Reference:** the [API reference on JSR](https://jsr.io/@sekhmet/dispatch/doc)
  documents every export.

The guides are also on the
[docs site](https://ben-laird.github.io/sekhmet/dispatch/).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/dispatch/LICENSE.md).

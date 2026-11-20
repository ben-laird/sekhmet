# @sekhmet/lifetime

RAII for TypeScript, in any JavaScript runtime. A `Resource` is the rising
edge: `init` acquires a value and `deinit` releases it. Each start hands back
a `Lifetime`, the falling edge, which owns the value and guarantees its
teardown: cleanups and adopted children share one stack, released in reverse
acquisition order, once, with a typed cause. A cleanup that fails is a panic
in the report, never a reason to skip the rest.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/lifetime).

```sh
deno add jsr:@sekhmet/lifetime
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/lifetime      # npm
pnpm dlx jsr add @sekhmet/lifetime # pnpm
yarn dlx jsr add @sekhmet/lifetime # yarn
bunx jsr add @sekhmet/lifetime     # bun
```

## Example

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type Cause = "done" | "shutdown";

const order: string[] = [];
{
	await using app = new Lifetime<undefined, Cause>({
		value: undefined,
		panics: definePanicRuntime(),
		disposeCause: "shutdown",
	});
	app.defer(() => void order.push("close logs"));
	const db = app.child({ value: "db" });
	db.defer(async (cause) => {
		await Promise.resolve();
		order.push(`close db: ${cause}`);
	});
}
assertEquals(order, ["close db: shutdown", "close logs"]);
```

## API

| Export                                                 | Does                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `new Resource<I, T, C>({ init, deinit })`              | the rising edge: `init(input, setup)` acquires, `deinit(value, cause)` frees |
| `resource.start({ input, panics, disposeCause? })`     | a `Vow` of `Ok(lifetime)`, or `Err(panic)` if `init` panicked                |
| `new Lifetime<T, C>({ value, panics, disposeCause? })` | a root lifetime holding `value`, until a parent adopts it                    |
| `lifetime.phase()`                                     | `Alive(value)`, `Ending(cause)` or `Ended(report)`                           |
| `lifetime.value()`, `lifetime.with(fn)`                | the value, or `fn` run on it, only while Alive                               |
| `lifetime.defer(cleanup)`                              | a cleanup on the teardown stack; returns a `Registration`                    |
| `lifetime.adopt({ child, fromParent? })`               | puts a root on the stack; returns an `Adoption`                              |
| `lifetime.child({ value, fromParent? })`               | `new Lifetime` plus `adopt`                                                  |
| `lifetime.endWhen(signal)`                             | ends the lifetime when an outside `DispatchSignal` dispatches                |
| `lifetime.end(cause)`                                  | ends it once, drains the stack LIFO; returns `ended`                         |
| `lifetime.ending`, `lifetime.ended`                    | signals of the cause, and of the `EndReport`                                 |
| `using`, `await using`                                 | end it with its dispose cause, and throw its cleanups' panics                |

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) gives a small web
  app a lifetime step by step: a cleanup, a tree of children, a database
  acquired through a `Resource`, teardown with `await using`, and a request
  ended from outside.
- **How-to guides:** [Recipes](./docs/recipes.md) for tearing down several
  database connections at once, cancelling `fetch`, ending on a timeout or
  a cancel, giving a child its own causes, building a resource on another,
  reading a failed teardown, and taking a cleanup back.
- **Explanation:** [Concepts](./docs/concepts.md) covers the RAII split
  between `Resource` and `Lifetime`, phases read from signals, the single
  reverse-acquisition stack, failed cleanups and double faults, `SetupEnd`,
  the adoption rules, causes per child, and why `Lifetime` is invariant in
  its cause.
- **Reference:** the [API reference on JSR](https://jsr.io/@sekhmet/lifetime/doc)
  documents every export.

The guides are also on the
[docs site](https://ben-laird.github.io/sekhmet/lifetime/).

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/lifetime/LICENSE.md).

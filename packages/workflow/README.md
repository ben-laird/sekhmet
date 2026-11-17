# Workflow

Helpers that mark the state of the code itself. `@sekhmet/workflow` gives you
`todo` and `unimplemented` for code that does not exist, `unreachable` for code
the types rule out, and `invariant` for conditions only a bug can break.

Each one panics through [`@sekhmet/panic`](https://jsr.io/@sekhmet/panic), so it is a
`Panic` with its own name, a typed cause, and a type guard that recognizes it
in a panic hook or after `catchUnwind`:

| Helper                 | Panics as               | Cause                | Guard                  |
| ---------------------- | ----------------------- | -------------------- | ---------------------- |
| `todo(options?)`       | `Panic (Todo)`          | `TodoCause`          | `isTodoPanic`          |
| `unimplemented(opts?)` | `Panic (Unimplemented)` | `UnimplementedCause` | `isUnimplementedPanic` |
| `unreachable(opts?)`   | `Panic (Unreachable)`   | `UnreachableCause`   | `isUnreachablePanic`   |
| `invariant(cond, o)`   | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |

## Installation

### Deno

```bash
deno add jsr:@sekhmet/workflow
```

### Node, Bun and other npm-compatible tools

```bash
npx jsr add @sekhmet/workflow
```

## `todo` and `unimplemented`

`todo` marks work still to do; `unimplemented` marks a path deliberately left
unsupported. Both take an optional description, a tracking URL and a
checklist:

```ts
import { todo } from "@sekhmet/workflow/todo";
import { assert, assertThrows } from "@std/assert";

function exportReport(_rows: readonly string[]): string {
	return todo({
		description: "export the report as CSV",
		subtasks: [
			{ description: "pick a CSV library", complete: true },
			{ description: "escape quotes" },
		],
		trackingUrl: new URL("https://example.com/issues/12"),
	});
}

const thrown = assertThrows(() => exportReport([]));
// Panic (Todo): a code path that is not implemented yet was executed
// Todo: export the report as CSV (tracked at https://example.com/issues/12)
//   - [x] pick a CSV library
//   - [ ] escape quotes
assert(String(thrown).startsWith("Panic (Todo): "));
```

`deno task ci` fails when non-test package source imports `todo` from
`@sekhmet/workflow`, so a placeholder never ships. `unimplemented` may.

## `unreachable`

Pass the value a `switch` narrowed to `never`: the call compiles only while
every case is handled. If untyped input slips through anyway, the value is kept
in the cause and rendered in the message, safely, whatever it is (cycles,
BigInts, symbols, throwing getters).

```ts
import { isUnreachablePanic, unreachable } from "@sekhmet/workflow/unreachable";
import { assert, assertEquals, assertThrows } from "@std/assert";

type Status = "open" | "closed";

function label(status: Status): string {
	switch (status) {
		case "open":
			return "Open";
		case "closed":
			return "Closed";
		default:
			return unreachable({ value: status });
	}
}

const thrown = assertThrows(() => label(JSON.parse('"archived"')));
assert(isUnreachablePanic(thrown));
assertEquals(thrown.cause.value, "archived");
```

## `invariant`

An assertion function: it narrows its condition, and panics when the condition
is falsy. Phrase `expectedBehavior` as a "should" statement; the message is
built around it. The condition comes first because `asserts` needs a parameter
to name.

```ts
import { invariant } from "@sekhmet/workflow/invariant";
import { assertEquals } from "@std/assert";

function total(prices: ReadonlyMap<string, number>, item: string): number {
	const price = prices.get(item);
	invariant(price !== undefined, {
		expectedBehavior: "every item in the cart should have a price",
	});
	return price; // narrowed to number
}

assertEquals(total(new Map([["apple", 2]]), "apple"), 2);
```

## Recognizing them

The guards read a private brand, so they never run a Proxy trap and never
accept a `Panic` built by hand with the same name. Use them in a hook:

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { isTodoPanic, todo } from "@sekhmet/workflow";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const unfinished: (string | undefined)[] = [];
runtime.setHook(({ payload }) => {
	if (isTodoPanic(payload)) unfinished.push(payload.cause.description);
});

runtime.catchUnwind(() => todo({ description: "retry on timeout" }));

assertEquals(unfinished, ["retry on timeout"]);
```

See [the guide](./docs/guide.md) for every message format, the causes, and how
the impossible value is rendered.

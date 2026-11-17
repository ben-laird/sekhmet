# Workflow

Helpers that mark the state of the code itself. `@sekhmet/workflow` gives you
`todo` and `unimplemented` for code that does not exist, `unreachable` for code
the types rule out, and `invariant`, `invariantEqual`, `defined` and
`satisfies` for what only a bug can break.

Each one panics through [`@sekhmet/panic`](https://jsr.io/@sekhmet/panic), so it is a
`Panic` with its own name, a typed cause, and a type guard that recognizes it
in a panic hook or after `catchUnwind`:

| Helper                 | Panics as               | Cause                | Guard                  |
| ---------------------- | ----------------------- | -------------------- | ---------------------- |
| `todo(options?)`       | `Panic (Todo)`          | `TodoCause`          | `isTodoPanic`          |
| `unimplemented(opts?)` | `Panic (Unimplemented)` | `UnimplementedCause` | `isUnimplementedPanic` |
| `unreachable(opts?)`   | `Panic (Unreachable)`   | `UnreachableCause`   | `isUnreachablePanic`   |
| `invariant(cond, o)`   | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
| `invariantEqual(o)`    | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
| `defined(value, o)`    | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |
| `satisfies(value, o)`  | `Panic (Invariant)`     | `InvariantCause`     | `isInvariantPanic`     |

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

`invariantEqual` is Rust's `assert_eq!`: it panics showing both values when
`actual` and `expected` differ by `Object.is`, or by the `equals` you pass.

```ts
import { invariantEqual } from "@sekhmet/workflow/invariant";

const columns = ["name", "price"];
const row = ["apple", "2"];
invariantEqual({
	actual: row.length,
	expected: columns.length,
	expectedBehavior: "every row should have a cell per column",
});
```

## `defined` and `satisfies`

Invariant checks that return the value, narrowed, so they fit inside an
expression. `defined` removes what counts as absent: `null` and `undefined` by
default, or only one of them with `absent: "undefined"` or `absent: "null"`.
It never tests truthiness, so `0`, `""` and `false` are present. `satisfies`
checks a predicate, and narrows when the predicate is a type guard, including
one TypeScript infers, such as `(v) => v !== undefined`.

```ts
import { defined, satisfies } from "@sekhmet/workflow/invariant";
import { assertEquals } from "@std/assert";

const stock = new Map([["apple", 0]]);
const count = defined(stock.get("apple"), {
	expectedBehavior: "every listed item should have a stock count",
});
assertEquals(count, 0); // number, and 0 is present

const isEven = (n: number): boolean => n % 2 === 0;
const pairs = satisfies(4, {
	predicate: isEven,
	expectedBehavior: "socks should come in pairs",
});
assertEquals(pairs, 4);
```

All four panic as `Panic (Invariant)`, and the cause's `check` says which
check failed and keeps the offending value.

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

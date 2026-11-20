---
kind: how-to
---

# Recipes

How-to guides for marking the state of your code with `@sekhmet/workflow`.
For every helper, its options, its cause and the exact message it panics
with, see the [API reference](https://jsr.io/@sekhmet/workflow/doc).

## How to choose a helper

Each helper panics, so use one only where reaching it means the program is
wrong; return a `Result` for an expected failure such as bad input
([why](./concepts.md#a-panic-means-a-bug)). Pick by what the code relies on:

| The code…                                  | Use              |
| ------------------------------------------ | ---------------- |
| is not written yet, but will be            | `todo`           |
| is deliberately not supported              | `unimplemented`  |
| cannot run unless the types lie            | `unreachable`    |
| relies on a condition only a bug can break | `invariant`      |
| relies on two values being equal           | `invariantEqual` |
| relies on a value being present            | `defined`        |
| relies on a value passing a predicate      | `satisfies`      |

## How to mark unfinished or unsupported work

This guide shows you how to leave a placeholder that says what is missing.

1. Return `todo(…)` from the unfinished function; it returns `never`, so it
   fits any return type. Use `unimplemented(…)` instead for a path you do not
   plan to support.
2. Describe the work with a `description`, a `trackingUrl` and a checklist of
   `subtasks`, each `complete` or not. Every part is optional.

```ts
import { isTodoPanic, todo } from "@sekhmet/workflow/todo";
import { assert, assertEquals, assertThrows } from "@std/assert";

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
assert(isTodoPanic(thrown));
assertEquals(
	thrown.message,
	"a code path that is not implemented yet was executed\n" +
		"Todo: export the report as CSV (tracked at https://example.com/issues/12)\n" +
		"  - [x] pick a CSV library\n" +
		"  - [ ] escape quotes",
);
```

`unimplemented` may ship; `todo` should not (see
[How to keep `todo` out of releases](#how-to-keep-todo-out-of-releases)).

## How to make a `switch` exhaustive with `unreachable`

This guide shows you how to make the compiler reject a `switch` that misses a
case.

1. Handle each member of the union in its own `case`.
2. In `default`, return `unreachable({ value })`, passing the value you
   switched on. There it is narrowed to `never`, so the call compiles only
   while every member is handled.

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

Add `"archived"` to `Status` and the `unreachable` line stops compiling until
you add its `case`. If untyped input slips through anyway, the value is kept
in the cause and rendered in the message. For a branch with no value to
check, call `unreachable()` without one.

## How to assert a condition with `invariant`

This guide shows you how to state a condition the rest of a function relies
on, and have TypeScript narrow by it.

1. Call `invariant(condition, { expectedBehavior })` before the code that
   relies on the condition. It is an assertion function, so the condition
   narrows after the call.
2. Phrase `expectedBehavior` as a "should" statement about the program; the
   message is built around it.

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

## How to check that two values are equal

This guide shows you how to assert equality and see both values when it
fails, like Rust's `assert_eq!`.

1. Call `invariantEqual` with the value the program computed as `actual` and
   the one it should have computed as `expected`.
2. To compare objects or arrays by content or by a key, pass
   `equals({ actual, expected })`; without it, values compare by `Object.is`.

```ts
import { invariantEqual, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { assert, assertEquals, assertThrows } from "@std/assert";

const columns = ["name", "price"];
const row = ["apple", "2"];
invariantEqual({
	actual: row.length,
	expected: columns.length,
	expectedBehavior: "every row should have a cell per column",
});

type User = { id: number; name: string };
const thrown = assertThrows(() => {
	invariantEqual<User>({
		actual: { id: 1, name: "Ada" },
		expected: { id: 2, name: "Ada" },
		equals: ({ actual, expected }) => actual.id === expected.id,
		expectedBehavior: "the session should belong to the signed-in user",
	});
});
assert(isInvariantPanic(thrown));
assertEquals(thrown.cause.check, {
	kind: "equal",
	actual: { id: 1, name: "Ada" },
	expected: { id: 2, name: "Ada" },
});
```

## How to narrow a value inside an expression

This guide shows you how to check a value and use it in the same expression,
with `defined` and `satisfies`. Both return the value, narrowed.

1. Use `defined(value, { expectedBehavior })` to remove `null` and
   `undefined`. Pass `absent: "undefined"` or `absent: "null"` to remove only
   one of them. It never tests truthiness, so `0` passes.
2. Use `satisfies(value, { predicate, expectedBehavior })` to check a
   predicate. It narrows when the predicate is a type guard, including one
   TypeScript infers, such as `(v) => v !== undefined`.

```ts
import {
	defined,
	isInvariantPanic,
	satisfies,
} from "@sekhmet/workflow/invariant";
import { assert, assertEquals, assertThrows } from "@std/assert";

const stock = new Map([["apple", 0]]);
const count: number = defined(stock.get("apple"), {
	expectedBehavior: "every listed item should have a stock count",
});
assertEquals(count, 0); // 0 is present

const settings: Record<string, unknown> = JSON.parse(
	'{ "theme": "dark", "fontSize": 14 }',
);
const textSetting = (key: string): string => {
	return satisfies(settings[key], {
		predicate: (value) => typeof value === "string",
		expectedBehavior: "a text setting should hold a string",
	}); // narrowed from unknown to string
};

assertEquals(textSetting("theme").toUpperCase(), "DARK");

const thrown = assertThrows(() => textSetting("fontSize"));
assert(isInvariantPanic(thrown));
assertEquals(thrown.cause.check, { kind: "satisfies", value: 14 });
```

A discriminant check such as `(s) => s.kind === "circle"` is not inferred as
a guard when written inline in the options. Declare it on its own
(`const isCircle = (s: Shape) => s.kind === "circle"`), where TypeScript
infers the guard, or annotate its return type (`s is Circle`).

## How to attach a tracking or issue URL

This guide shows you how to point a panic at where the work or the bug is
tracked, and read it back.

1. Give `todo` and `unimplemented` a `trackingUrl`: the issue that tracks the
   missing work.
2. Give `unreachable` and the invariant checks an `issueUrl`: where to report
   the bug, such as your repository's issue tracker. The message adds
   `Please file an issue at <url>`.
3. Read either back from the panic's `cause`, after narrowing with its guard.

```ts
import { invariant, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { isUnimplementedPanic, unimplemented } from "@sekhmet/workflow/todo";
import { assert, assertEquals, assertThrows } from "@std/assert";

const issues = new URL("https://example.com/issues");

const broken = assertThrows(() => {
	invariant([].length > 0, {
		expectedBehavior: "the cart should never be empty at checkout",
		issueUrl: issues,
	});
});
assert(isInvariantPanic(broken));
assertEquals(broken.cause.issueUrl, issues);

const unsupported = assertThrows(() => {
	unimplemented({ description: "sync over FTP" });
});
assert(isUnimplementedPanic(unsupported));
assertEquals(unsupported.cause, {
	description: "sync over FTP",
	subtasks: [],
	trackingUrl: undefined,
});
```

## How to recognize the panics

This guide shows you how to tell the helpers' panics apart from other panics,
in a panic hook or after `catchUnwind`.

1. Run the program inside a panic runtime from `@sekhmet/panic`
   (`definePanicRuntime()`); its hook reports these panics like any other.
2. Test the payload with `isTodoPanic`, `isUnimplementedPanic`,
   `isUnreachablePanic` or `isInvariantPanic`. Each narrows an `unknown` to
   the panic with its typed cause, and accepts only its own helper's panic: a
   todo panic is not an unimplemented one.
3. `isInvariantPanic` accepts the panic of every invariant check; switch on
   `cause.check.kind` to tell them apart.

In a hook:

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

After `catchUnwind`:

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { defined, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { isPanicAnd, unwrapPanicked } from "@sekhmet/panic/outcome/mini";
import { assert, assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

const result = runtime.catchUnwind(() => {
	return defined(new Map<string, number>().get("apple"), {
		expectedBehavior: "every item should have a price",
	});
});

assert(isPanicAnd(result, isInvariantPanic));
const payload = unwrapPanicked(result);
assertEquals(payload.cause.check.kind, "defined");
```

The guards recognize only panics thrown by the same copy of the package, in
the same realm; see
[Recognizing a panic by its brand](./concepts.md#recognizing-a-panic-by-its-brand)
for what to do about a second copy.

## How to keep `todo` out of releases

This guide shows you how to check that no `todo` placeholder is left before
you publish. `unimplemented`, `unreachable` and the invariant checks are
meant to ship; only `todo` marks work that is not done.

1. Search your non-test source for `todo` imported from `@sekhmet/workflow`,
   for example with
   `grep -rn --include="*.ts" --exclude="*.test.ts" "todo" src`, and check
   each hit.
2. For each placeholder, finish the work, or replace `todo` with
   `unimplemented` if the path will stay unsupported.

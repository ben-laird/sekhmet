# Getting started

## When to use a vow

Use a `Vow` where you want promise-style composition but cannot or do not want
to wait for a microtask: wiring values that arrive from callbacks, building a
dependency graph that should settle in one pass, or testing code without
`await`. Use a `Promise` for work that is asynchronous anyway; `wait` and
`fromPromise` convert between the two.

## Create a vow

```ts
import { assertEquals } from "@std/assert";
import { resolved, Vow, vowWithResolver, wait } from "@sekhmet/vow";

// Resolved inside the executor: resolved as soon as it is constructed
const now = new Vow<number>((resolve) => resolve(1));

// Already resolved, shorter
const alsoNow = resolved(2);

// Resolved later by whoever holds `resolve`
const { vow: later, resolve } = vowWithResolver<number>();
resolve(3);

assertEquals(await Promise.all([wait(now), wait(alsoNow), wait(later)]), [
	1,
	2,
	3,
]);
```

## Resolution is synchronous

`map` returns a new vow. If the source is already resolved, the mapping runs
immediately; otherwise it runs inside the source's `resolve` call.

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver } from "@sekhmet/vow";

const order: string[] = [];
const { vow, resolve } = vowWithResolver<string>();

map(vow, (value) => order.push(`mapped ${value}`));
order.push("before resolve");
resolve("x");
order.push("after resolve");

assertEquals(order, ["before resolve", "mapped x", "after resolve"]);
```

A vow resolves once. Calling its resolver again does nothing.

## Bridge to promises

`wait` turns a vow into a promise. `fromPromise` goes the other way; since a vow
cannot fail, the outcome is carried as a `Result` from `@sekhmet/enum/result`:

```ts
import { assertEquals } from "@std/assert";
import { fromPromise, map, wait } from "@sekhmet/vow";
import { match } from "@sekhmet/enum/core/mini";

const loaded = fromPromise(Promise.reject(new Error("offline")));
const message = map(loaded, (result) =>
	match(result)({
		Ok: (value) => `loaded ${String(value)}`,
		Err: (reason) =>
			`failed: ${reason instanceof Error ? reason.message : String(reason)}`,
	}));

assertEquals(await wait(message), "failed: offline");
```

## Errors in dependents

If a callback attached to a vow throws while the vow resolves, the other
callbacks still run, and the `resolve` call throws an `AggregateError` that
holds every thrown error. The vow itself is resolved either way.

```ts
import { assertEquals, assertThrows } from "@std/assert";
import { map, vowWithResolver, wait } from "@sekhmet/vow";

const { vow, resolve } = vowWithResolver<number>();
const seen: number[] = [];

map(vow, () => {
	throw new Error("bad dependent");
});
map(vow, (n) => seen.push(n));

assertThrows(() => resolve(1), AggregateError);
assertEquals(seen, [1]);
assertEquals(await wait(vow), 1);
```

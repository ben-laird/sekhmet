---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when a vow meets the rest of a program.
For every export, see the [API reference](https://jsr.io/@sekhmet/vow/doc);
for why a vow behaves as it does, see the [concepts](./concepts.md).

## How to resolve a vow later from a callback

This guide shows you how to turn a value that arrives through a callback, such
as an event, into a vow.

1. Call `vowWithResolver` to get a pending vow and the function that resolves
   it.
2. Hand `resolve` to the callback API.
3. Derive from the vow as usual; the derived vows resolve when the callback
   fires.

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver, wait } from "@sekhmet/vow";

const target = new EventTarget();
const { vow: ready, resolve } = vowWithResolver<string>();
target.addEventListener("ready", (event) => resolve(event.type), {
	once: true,
});

const status = map(ready, (type) => `got ${type}`);
target.dispatchEvent(new Event("ready"));

assertEquals(await wait(status), "got ready");
```

A vow resolves once, so if the callback can fire more than once, only the
first call counts.

## How to resolve a vow from an executor

This guide shows you how to create a vow whose resolution is set up in one
place, as with `new Promise`.

1. Construct a `Vow` with an executor; it receives `resolve`.
2. Call `resolve` inside the executor to resolve the vow as soon as it is
   constructed, or keep it to call later.

```ts
import { assertEquals } from "@std/assert";
import { Vow, wait } from "@sekhmet/vow";

const now = new Vow<number>((resolve) => resolve(1));

let resolveLater = (_value: number): void => {};
const later = new Vow<number>((resolve) => {
	resolveLater = resolve;
});
resolveLater(2);

assertEquals(await Promise.all([wait(now), wait(later)]), [1, 2]);
```

If you already have the value, `resolved(value)` is shorter than an executor
that resolves at once.

## How to start a chain from a value you already have

This guide shows you how to feed a known value into code that expects a vow.

1. Wrap the value with `resolved`.
2. Pass the vow on; dependents attached to it run as soon as they are
   attached.

```ts
import { assertEquals } from "@std/assert";
import { map, resolved } from "@sekhmet/vow";

const seen: number[] = [];
map(resolved(2), (n) => seen.push(n));

assertEquals(seen, [2]);
```

## How to combine two vows

This guide shows you how to compute a value from two vows that may resolve in
either order.

1. Use `zipWith` with a function of both values, or `zip` for the pair itself.
2. The combined vow resolves once both inputs have resolved, inside the call
   that resolves the second one.

```ts
import { assertEquals } from "@std/assert";
import { resolved, vowWithResolver, wait, zip, zipWith } from "@sekhmet/vow";

const { vow: quantity, resolve: setQuantity } = vowWithResolver<number>();
const total = zipWith(resolved(100), quantity, (price, qty) => price * qty);
const pair = zip(resolved("widget"), quantity);

setQuantity(3);

assertEquals(await wait(total), 300);
assertEquals(await wait(pair), ["widget", 3]);
```

## How to await a vow in async code

This guide shows you how to hand a vow's value to code that works with
promises.

1. Call `wait` on the vow to get a `Promise` of its value.
2. `await` it, or pass it to anything that takes a promise.

```ts
import { assertEquals } from "@std/assert";
import { vowWithResolver, wait } from "@sekhmet/vow";

const { vow, resolve } = vowWithResolver<string>();
const pending = wait(vow);

resolve("hello");

assertEquals(await pending, "hello");
```

The promise resolves on a later microtask, even when the vow is already
resolved.

## How to turn a promise into a vow and handle failure

This guide shows you how to bring a promise's outcome into a vow graph without
losing its rejection.

1. Call `fromPromise`. The vow it returns stays pending until the promise
   settles, then resolves with `Ok(value)` or `Err(reason)`.
2. `map` the vow and `match` on the `Result` to handle both cases.

```ts
import { assertEquals } from "@std/assert";
import { fromPromise, map, wait } from "@sekhmet/vow";
import { match } from "@sekhmet/enum/core/mini";

const loaded = fromPromise(Promise.reject(new Error("offline")));
const message = map(loaded, (result) => {
	return match(result)({
		Ok: (value) => `loaded ${String(value)}`,
		Err: (reason) => {
			if (reason instanceof Error) {
				return `failed: ${reason.message}`;
			}
			return `failed: ${String(reason)}`;
		},
	});
});

assertEquals(await wait(message), "failed: offline");
```

The reason is typed `unknown`, since a promise can reject with anything, so
narrow it before use. The predicates and unwrapping helpers in
`@sekhmet/enum/result/mini`, such as `isOk` and `unwrapOr`, work on the value
too.

## How to catch errors thrown by dependents

This guide shows you how to resolve a vow when a dependent's callback might
throw.

1. Call `resolve` inside a `try`, or wherever your program reports faults.
2. Catch the `AggregateError` it throws; its `errors` hold what each failing
   dependent threw.

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver } from "@sekhmet/vow";

const { vow, resolve } = vowWithResolver<number>();
map(vow, () => {
	throw new Error("bad dependent");
});

let reported: unknown[] = [];
try {
	resolve(1);
} catch (error: unknown) {
	if (error instanceof AggregateError) {
		reported = error.errors;
	}
}

assertEquals(reported.length, 1);
```

The vow is resolved and every other dependent has run by the time the error
reaches you. See [errors in dependents](./concepts.md#errors-in-dependents)
for why.

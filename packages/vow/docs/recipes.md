---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when a vow meets the rest of a program. For
every export, see the [API reference](https://jsr.io/@sekhmet/vow/doc); for why
a vow behaves as it does, see the [concepts](./concepts.md).

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

A vow resolves once, so if the callback can fire more than once, only the first
call counts.

## How to resolve a vow from an executor

This guide shows you how to create a vow whose value is computed where the vow
is made, as with `new Promise`.

1. Construct a `Vow` with an executor; it receives `resolve`.
2. Compute the value and call `resolve` inside the executor. The vow is resolved
   by the time the constructor returns.

```ts
import { assertEquals } from "@std/assert";
import { map, Vow } from "@sekhmet/vow";

const config = new Vow<{ retries: number }>((resolve) => {
	const retries = Number("3");
	resolve({ retries });
});

const seen: number[] = [];
map(config, ({ retries }) => seen.push(retries));

assertEquals(seen, [3]);
```

## How to start a chain from a value you already have

This guide shows you how to feed a known value into code that expects a vow.

1. Wrap the value with `resolved`.
2. Pass the vow on; dependents attached to it run as soon as they are attached.

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

## How to chain vows

This guide shows you how to run a step that needs one vow's value and itself
returns a vow, without ending up with a vow of a vow.

1. Use `andThen` with a function from the value to the next vow.
2. The chained vow resolves with the next vow's value, once both have resolved.
   When every step is already resolved, it resolves before `andThen` returns.

```ts
import { assertEquals } from "@std/assert";
import {
	andThen,
	map,
	resolved,
	type Vow,
	vowWithResolver,
} from "@sekhmet/vow";

const { vow: userId, resolve: setUserId } = vowWithResolver<number>();
const names = new Map<number, Vow<string>>([[7, resolved("Ada")]]);

const name = andThen(userId, (id) => names.get(id) ?? resolved("unknown"));
const seen: string[] = [];
map(name, (value) => seen.push(value));

setUserId(7);

assertEquals(seen, ["Ada"]); // ran synchronously inside setUserId
```

Use `map` instead when the step returns a plain value.

## How to read a resolved vow's value synchronously

This guide shows you how to get a vow's value right now, in synchronous code,
when it may already have resolved.

1. Call `value` on the vow. It returns `Some(value)` if the vow has resolved and
   `None` if it is still pending.
2. Handle `None` there and then: `value` reads the current state and never
   waits. Use `map` or `andThen` to act on the value whenever it arrives.

```ts
import { assertEquals } from "@std/assert";
import { None, Some } from "@sekhmet/enum/option/mini";
import { andThen, resolved, value, vowWithResolver } from "@sekhmet/vow";

const sync = andThen(resolved(2), (n) => resolved(n * 10));
assertEquals(value(sync), Some(20)); // every step was resolved

const { vow, resolve } = vowWithResolver<number>();
assertEquals(value(vow), None()); // still pending
resolve(1);
assertEquals(value(vow), Some(1));
```

To read the state as a `Poll` instead, call `poll`: it returns `Ready(value)`
or `Pending()`, and `expectReady` from `@sekhmet/enum/poll/mini` unwraps work
you know settled synchronously.

```ts
import { assertEquals } from "@std/assert";
import { expectReady } from "@sekhmet/enum/poll/mini";
import { andThen, poll, resolved } from "@sekhmet/vow";

const sync = andThen(resolved(2), (n) => resolved(n * 10));
assertEquals(expectReady(poll(sync), "every step was resolved"), 20);
```

To branch on the state without reading the value, use the type guards
`isResolved` and `isPending`.

## How to await a vow in async code

This guide shows you how to hand a vow's value to code that works with promises.

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
losing its rejection. The bridge is `@sekhmet/panic`'s `catchUnwind`, since a
rejection is a throw, and a throw means panic.

1. Run the promise through your program's panic runtime:
   `panics.catchUnwind(() => promise)`. The vow it returns stays pending until
   the promise settles, then resolves with an `Outcome`.
2. When a rejection is an expected failure, classify it first, as a `Result`
   (`promise.then(Ok, Err)`), and flatten what the boundary caught with
   `fromCaught`. Any other rejection is `Panicked`, reported to the hook.
3. `map` the vow and `match` on the `Outcome` to handle each case.

```ts
import { assertEquals } from "@std/assert";
import { map, wait } from "@sekhmet/vow";
import { match } from "@sekhmet/enum/core/mini";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { fromCaught } from "@sekhmet/panic/outcome/mini";

const panics = definePanicRuntime(); // once, at your program's entry point
const request: Promise<number> = Promise.reject(new Error("offline"));
const loaded = panics.catchUnwind(() => {
	return request.then(Ok<number, unknown>, Err<number, unknown>);
});
const message = map(loaded, (caught) => {
	return match(fromCaught(caught))({
		Ok: (value) => `loaded ${String(value)}`,
		Err: (reason) => {
			if (reason instanceof Error) {
				return `failed: ${reason.message}`;
			}
			return `failed: ${String(reason)}`;
		},
		Panicked: () => "bug",
	});
});

assertEquals(await wait(message), "failed: offline");
```

The reason is typed `unknown`, since a promise can reject with anything, so
narrow it before use. The panic runtime also catches a different failure: a
dependent of the vow that throws, which is a bug, not an outcome of the
promise. See
[how to catch errors thrown by dependents](#how-to-catch-errors-thrown-by-dependents).

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
reaches you. See [errors in dependents](./concepts.md#errors-in-dependents) for
why.

A vow made from a promise is different: you never call its resolver, the
promise's `then` callback does, so there is no `try` to put it in. Its
dependents' errors go to the panic runtime whose `catchUnwind` made it.

1. Make the vow with `catchUnwind` on the panic runtime your program runs in.
2. Set that runtime's hook to report faults; it receives the `AggregateError`.

```ts
import { assertEquals, assertInstanceOf } from "@std/assert";
import { map, wait } from "@sekhmet/vow";
import { definePanicRuntime } from "@sekhmet/panic";
import { Ok } from "@sekhmet/panic/outcome/mini";

const panics = definePanicRuntime();
const reported: unknown[] = [];
panics.setHook(({ payload }) => reported.push(payload)); // stands in for a real reporter

const loaded = panics.catchUnwind(() => Promise.resolve(1));
map(loaded, () => {
	throw new Error("bad dependent");
});

assertEquals(await wait(loaded), Ok(1));
assertEquals(reported.length, 1);
assertInstanceOf(reported[0], AggregateError);
```

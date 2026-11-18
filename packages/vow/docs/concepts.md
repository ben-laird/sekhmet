---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/vow`, and why a vow behaves the way it does. The
[recipes](./recipes.md) show how to put them to work, and the
[API reference on JSR](https://jsr.io/@sekhmet/vow/doc) documents each export.

## When to use a vow

A `Vow` is a promise-like value: it starts out `Pending` and later becomes
`Resolved` with a value, and you can derive new vows from it with `map`, `zip`
and `zipWith` before that value exists. The difference is timing. A promise
always runs its callbacks on a later microtask; a vow runs them at once.

That makes a vow the better fit where you want promise-style composition but
cannot or do not want to wait for a microtask: wiring values that arrive from
callbacks, building a dependency graph that should settle in one pass, or
testing code without `await`. Use a `Promise` for work that is asynchronous
anyway, such as I/O. `wait` and `fromPromise` convert between the two, so each
part of a program can use whichever fits.

## Resolution is synchronous

`map` returns a new vow. If the source is already resolved, the mapping runs
immediately, inside the `map` call. Otherwise it is recorded as a dependent of
the source and runs inside the source's `resolve` call, before `resolve`
returns:

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

The same holds for `zip` and `zipWith`, which resolve inside the call that
resolves the last of their two inputs, and for chains: a value flows through
every vow that depends on it, directly or not, in one call stack. Dependents
run in the order they were attached.

This is why a vow suits a dependency graph. Once `resolve` returns, everything
downstream of it has settled, so code that runs next sees a consistent state
with nothing left in flight.

`wait` and `fromPromise` are the two places a vow meets the microtask queue.
`wait` returns a `Promise`, and a promise never settles synchronously, so even
an already-resolved vow's promise resolves on the next microtask.
`fromPromise` resolves its vow from the promise's `then` callback, so its
dependents run on a microtask too, after the promise settles.

## A vow is an enum

A `Vow` is built on `Enum` from `@sekhmet/enum`, with two variants. `Pending`
holds the list of dependents waiting for the value; `Resolved` holds the value.
Resolving a vow swaps the first variant for the second and then calls each
dependent. There is no third state: a vow has no `Rejected` variant.

## A vow resolves once

The first call to a vow's resolver wins. Once the vow is `Resolved`, later
calls do nothing: the value does not change and dependents are not called
again.

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver, wait } from "@sekhmet/vow";

const { vow, resolve } = vowWithResolver<number>();
const seen: number[] = [];
map(vow, (n) => seen.push(n));

resolve(1);
resolve(2);

assertEquals(seen, [1]);
assertEquals(await wait(vow), 1);
```

A vow is a value that becomes known once, not a stream of values. For a value
that changes over time, make a new vow per change or use a different tool.

## A vow cannot fail

Since a vow has no rejected state, a failure that a vow carries has to live in
its value. `fromPromise` does exactly that: a promise can reject, so the vow
it returns resolves with a `Result` from `@sekhmet/enum/result`, `Ok(value)`
when the promise fulfils and `Err(reason)` when it rejects. The promise's
own rejection is always handled, so it never surfaces as an unhandled
rejection. A dependent that throws is another matter; see
[errors in dependents](#errors-in-dependents). Keeping the
failure in the value means the type says the vow can carry one, and every
dependent decides what to do with it.

## Errors in dependents

A vow cannot fail, but the code that runs when it resolves can throw. If a
callback attached to a vow throws while the vow resolves, the other callbacks
still run, and the `resolve` call throws an `AggregateError` that holds every
thrown error. The vow itself is resolved either way.

```ts
import { assertEquals, assertThrows } from "@std/assert";
import { map, vowWithResolver, wait } from "@sekhmet/vow";

const { vow, resolve } = vowWithResolver<number>();
const seen: number[] = [];

map(vow, () => {
	throw new Error("bad dependent");
});
map(vow, (n) => seen.push(n));

const thrown = assertThrows(() => resolve(1), AggregateError);
assertEquals(thrown.errors.length, 1);
assertEquals(seen, [1]);
assertEquals(await wait(vow), 1);
```

Running every dependent keeps one faulty callback from starving the rest of
the graph, and throwing at the end keeps the fault from passing silently. The
error surfaces in whoever called `resolve`, since that is the call stack the
dependents ran in.

For a vow from `fromPromise`, whoever called `resolve` is the promise's `then`
callback, not your code. A dependent that throws there makes that callback
throw, so the `AggregateError` becomes an unhandled promise rejection that no
caller can catch with `try`. Keep dependents of a `fromPromise` vow from
throwing, or handle the runtime's unhandled-rejection event.

A few consequences follow from where the mapping runs:

- The vow `map` returned for a throwing mapping has no value to resolve with,
  so it stays `Pending`, and so does everything derived from it.
- Mapping an already-resolved vow runs the mapping inside `map`, so a throw
  comes straight out of the `map` call, not wrapped in an `AggregateError`.
- A throw further down a chain is wrapped once per vow it passes through: the
  `resolve` call throws an `AggregateError` whose error is the
  `AggregateError` thrown by the intermediate vow's resolution. `zipWith` is
  `map` over `zip`, so a throw in its mapping passes through two vows and is
  wrapped one level deeper than a throw in a `map` would be.

---
kind: tutorial
---

# Getting started

In this tutorial we will build an order total from a price and a quantity that
arrive separately. We will start with one pending value, derive a new value
from it, combine it with a second one, and finish by handing the total to
async code. Each step is a complete program you can run.

## Install

Add the package and `@std/assert`, which each step uses to check its output:

```sh
deno add jsr:@sekhmet/vow jsr:@std/assert
```

## Wait for a price

First, we make a vow for the price, which we don't know yet, and attach a
callback that records it:

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver } from "@sekhmet/vow";

const { vow: price, resolve: setPrice } = vowWithResolver<number>();
const seen: number[] = [];
map(price, (value) => seen.push(value));

assertEquals(seen, []);

setPrice(5);
assertEquals(seen, [5]);
```

Before `setPrice` is called, `seen` is empty: the vow is pending. Once it is
called, `seen` is `[5]` on the very next line. The callback ran inside
`setPrice`, with no `await` in between.

## Add a fee

Next, we derive a new vow from the price. `map` returns a vow of the
callback's result:

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver } from "@sekhmet/vow";

const { vow: price, resolve: setPrice } = vowWithResolver<number>();
const withFee = map(price, (value) => value + 1);

const seen: number[] = [];
map(withFee, (value) => seen.push(value));

setPrice(5);
assertEquals(seen, [6]);
```

Resolving the price resolved `withFee` too, in the same call: `seen` is `[6]`.

## Combine it with a quantity

Now let's bring in the quantity, which arrives on its own. `zipWith` waits for
both vows and combines their values:

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver, zipWith } from "@sekhmet/vow";

const { vow: price, resolve: setPrice } = vowWithResolver<number>();
const { vow: quantity, resolve: setQuantity } = vowWithResolver<number>();
const withFee = map(price, (value) => value + 1);
const total = zipWith(withFee, quantity, (each, count) => each * count);

const seen: number[] = [];
map(total, (value) => seen.push(value));

setPrice(5);
assertEquals(seen, []);

setQuantity(3);
assertEquals(seen, [18]);
```

After the price, `seen` is still empty, because the total needs the quantity
too. After the quantity, it is `[18]`.

## Change your mind

Let's try to set the quantity a second time:

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver, zipWith } from "@sekhmet/vow";

const { vow: price, resolve: setPrice } = vowWithResolver<number>();
const { vow: quantity, resolve: setQuantity } = vowWithResolver<number>();
const withFee = map(price, (value) => value + 1);
const total = zipWith(withFee, quantity, (each, count) => each * count);

const seen: number[] = [];
map(total, (value) => seen.push(value));

setPrice(5);
setQuantity(3);
setQuantity(10);

assertEquals(seen, [18]);
```

`seen` is still `[18]`. A vow is resolved once, and the first value stays.

## Await the total

Last, we hand the total to code that works with promises. `wait` turns a vow
into a `Promise` of its value:

```ts
import { assertEquals } from "@std/assert";
import { map, vowWithResolver, wait, zipWith } from "@sekhmet/vow";

const { vow: price, resolve: setPrice } = vowWithResolver<number>();
const { vow: quantity, resolve: setQuantity } = vowWithResolver<number>();
const withFee = map(price, (value) => value + 1);
const total = zipWith(withFee, quantity, (each, count) => each * count);

setPrice(5);
setQuantity(3);

assertEquals(await wait(total), 18);
```

`await wait(total)` gives `18`, the same value the callbacks saw.

## What we built

You have built a small graph of values: a price, a price with a fee derived from
it, and a total that waits for a quantity too. Each value settled the moment
its inputs did, all in one call stack, and the result crossed into async code
at the end.

From here:

- [Recipes](./recipes.md) show how to resolve a vow from a callback, combine
  vows, and convert between vows and promises, including a promise that can
  fail.
- [Concepts](./concepts.md) explain when to use a vow rather than a promise,
  why resolution is synchronous, and what happens when a dependent throws.
- The [API reference on JSR](https://jsr.io/@sekhmet/vow/doc) documents every
  export.

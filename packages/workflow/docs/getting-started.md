---
kind: tutorial
---

# Getting started

In this tutorial we will write a small shipping calculator: it labels a
parcel's status and prices a parcel by its delivery zone and weight. We will
start from a placeholder, fill it in, and mark each assumption the code
makes, then run the finished calculator in a panic runtime. Each step is a
complete program you can run.

## Install

Add the package, `@sekhmet/panic`, whose runtime we will use in the last step,
and `@std/assert`, which each step uses to check its output:

```sh
deno add jsr:@sekhmet/workflow jsr:@sekhmet/panic jsr:@std/assert
```

## Start with a placeholder

First, we declare the function that labels a status, but leave its body for
later with `todo`:

```ts
import { isTodoPanic, todo } from "@sekhmet/workflow/todo";
import { assert, assertEquals, assertThrows } from "@std/assert";

type Status = "packed" | "shipped";

function label(_status: Status): string {
	return todo({ description: "label each parcel status" });
}

const thrown = assertThrows(() => label("packed"));

assert(isTodoPanic(thrown));
assertEquals(thrown.name, "Panic (Todo)");
assertEquals(
	thrown.message,
	"a code path that is not implemented yet was executed\n" +
		"Todo: label each parcel status",
);
```

The program compiles, because `todo` returns `never`, which fits any return
type. Calling `label` panics as `Panic (Todo)`, and the message says what is
missing.

## Fill it in with an exhaustive `switch`

Now let's write the body. We handle each status, and pass what is left over
to `unreachable`:

```ts
import { isUnreachablePanic, unreachable } from "@sekhmet/workflow/unreachable";
import { assert, assertEquals, assertThrows } from "@std/assert";

type Status = "packed" | "shipped";

function label(status: Status): string {
	switch (status) {
		case "packed":
			return "Packed";
		case "shipped":
			return "Shipped";
		default:
			return unreachable({ value: status });
	}
}

assertEquals(label("shipped"), "Shipped");

const fromUntypedInput = JSON.parse('"lost"');
const thrown = assertThrows(() => label(fromUntypedInput));

assert(isUnreachablePanic(thrown));
assertEquals(thrown.cause.value, "lost");
```

In the `default` branch, both statuses have been handled, so `status` is
narrowed to `never` and the call compiles. A value the types did not cover, here
from `JSON.parse`, panics as `Panic (Unreachable)` and keeps the value in its
cause.

## Look up a value that must be there

Next, we price a parcel by its zone. Every zone we ship to has a rate, so a
missing rate is a bug. `defined` returns the rate, typed as a `number`, and
panics if it is absent:

```ts
import { defined, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { assert, assertEquals, assertThrows } from "@std/assert";

const rates = new Map([
	["local", 0],
	["national", 5],
]);

function rate(zone: string): number {
	return defined(rates.get(zone), {
		expectedBehavior: "every zone we ship to should have a rate",
	});
}

assertEquals(rate("local"), 0);

const thrown = assertThrows(() => rate("lunar"));

assert(isInvariantPanic(thrown));
assertEquals(
	thrown.message,
	"an invariant was violated\n" +
		"Expected behavior: every zone we ship to should have a rate\n" +
		"Absent value: undefined",
);
```

A rate of `0` is present: `defined` rejects only `null` and `undefined`. The
message is built around the expected behavior we wrote as a "should"
statement.

## Check a condition

A parcel's price is its zone's rate plus a charge by weight. The weight comes
from our own scales, so it should always be positive. We say so with
`invariant`:

```ts
import {
	defined,
	invariant,
	isInvariantPanic,
} from "@sekhmet/workflow/invariant";
import { assert, assertEquals, assertThrows } from "@std/assert";

const rates = new Map([
	["local", 0],
	["national", 5],
]);

function rate(zone: string): number {
	return defined(rates.get(zone), {
		expectedBehavior: "every zone we ship to should have a rate",
	});
}

function price({ zone, weight }: { zone: string; weight: number }): number {
	invariant(weight > 0, {
		expectedBehavior: "a weighed parcel should weigh more than nothing",
	});
	return rate(zone) + weight * 2;
}

assertEquals(price({ zone: "national", weight: 1.5 }), 8);

const thrown = assertThrows(() => price({ zone: "local", weight: 0 }));

assert(isInvariantPanic(thrown));
assertEquals(thrown.cause.check, { kind: "condition", condition: false });
```

The cause records which check failed, here a `"condition"`, and the falsy
value it was given.

## Run the calculator in a panic runtime

Finally, we put `label` and `price` together into a quote, and run it inside
a panic runtime from `@sekhmet/panic`. A `catchUnwind` boundary reports each
panic that reaches it to the runtime's hook, and the guards tell ours apart:

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import {
	defined,
	invariant,
	isInvariantPanic,
} from "@sekhmet/workflow/invariant";
import { isUnreachablePanic, unreachable } from "@sekhmet/workflow/unreachable";
import { assertEquals } from "@std/assert";

type Status = "packed" | "shipped";
type Parcel = { status: Status; zone: string; weight: number };

function label(status: Status): string {
	switch (status) {
		case "packed":
			return "Packed";
		case "shipped":
			return "Shipped";
		default:
			return unreachable({ value: status });
	}
}

const rates = new Map([
	["local", 0],
	["national", 5],
]);

function rate(zone: string): number {
	return defined(rates.get(zone), {
		expectedBehavior: "every zone we ship to should have a rate",
	});
}

function price({ zone, weight }: { zone: string; weight: number }): number {
	invariant(weight > 0, {
		expectedBehavior: "a weighed parcel should weigh more than nothing",
	});
	return rate(zone) + weight * 2;
}

function quote(parcel: Parcel): string {
	return `${label(parcel.status)}: ${price(parcel)}`;
}

const runtime = definePanicRuntime();
const bugs: string[] = [];
runtime.setHook(({ payload }) => {
	if (isInvariantPanic(payload)) bugs.push(payload.cause.expectedBehavior);
	if (isUnreachablePanic(payload)) bugs.push("an impossible status");
});

assertEquals(
	quote({ status: "shipped", zone: "national", weight: 1.5 }),
	"Shipped: 8",
);

runtime.catchUnwind(() =>
	quote({ status: "packed", zone: "lunar", weight: 1 }),
);
runtime.catchUnwind(() =>
	quote({ status: "packed", zone: "local", weight: 0 }),
);
runtime.catchUnwind(() => quote(JSON.parse('{ "status": "lost" }')));

assertEquals(bugs, [
	"every zone we ship to should have a rate",
	"a weighed parcel should weigh more than nothing",
	"an impossible status",
]);
```

A good parcel gets its quote. Each bad one panics inside its `catchUnwind`,
which reports the panic to the hook, then returns it as an `Err` instead of
letting it propagate. The hook sees only panics that reach a boundary: one
caught by a plain `try`/`catch` first is never reported.

## Next steps

We have used `todo`, `unreachable`, `defined` and `invariant`, and caught
their panics in a runtime. From here:

- [Recipes](./recipes.md) show how to choose a helper, compare values with
  `invariantEqual`, narrow with `satisfies`, attach tracking and issue URLs,
  and keep `todo` out of releases.
- [Concepts](./concepts.md) explain why the helpers panic, how they build on
  `@sekhmet/panic`, and why they never throw anything else.
- The [API reference on JSR](https://jsr.io/@sekhmet/workflow/doc) documents
  every helper, its options, its cause and the message it panics with.

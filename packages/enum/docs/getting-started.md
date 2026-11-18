---
kind: tutorial
---

# Getting started

This guide installs `@sekhmet/enum` and walks through `Option` and `Result`, the
two types most code reaches for first. See the [overview](../README.md) for the
full list of features.

## Install

```sh
deno add jsr:@sekhmet/enum   # Deno
npx jsr add @sekhmet/enum    # npm (also: pnpm dlx, yarn dlx, bunx)
```

The package has no root export. Import a feature by its subpath, such as
`@sekhmet/enum/option`.

## A value that may be missing: `Option`

`Option<T>` is either `Some(value)` or `None()`. Use it where you would
otherwise return `T | undefined`.

```ts
import { assertEquals } from "@std/assert";
import { maybe, type Option } from "@sekhmet/enum/option";

const users = new Map([[1, "Ada"]]);

// maybe() is None for null or undefined, and Some for anything else
function findName(id: number): Option<string> {
	return maybe(users.get(id));
}

// Transform the value if there is one, then fall back to a default
const greeting = findName(1)
	.map((name) => `Hello, ${name}`)
	.unwrapOr("Hello, stranger");

assertEquals(greeting, "Hello, Ada");
assertEquals(findName(2).isNone(), true);
```

`unwrap()` returns the value or throws when there is none. Treat a throw as a
bug (a panic), not as error handling: prefer `unwrapOr`, `unwrapOrElse` (on
`Result`), `mapOr`, or a `match`.

## An operation that can fail: `Result`

`Result<T, E>` is either `Ok(value)` or `Err(error)`. Return it instead of
throwing when failure is an expected outcome.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

function parseAge(text: string): Result<number, string> {
	const age = Number(text);
	if (!Number.isInteger(age)) return Err(`not a whole number: ${text}`);
	if (age < 0) return Err("age cannot be negative");
	return Ok(age);
}

function checkAdult(age: number): Result<number, string> {
	return age >= 18 ? Ok(age) : Err("must be an adult");
}

// andThen chains steps that can each fail; the first Err wins
assertEquals(parseAge("42").andThen(checkAdult).unwrapOr(0), 42);
assertEquals(
	parseAge("12").andThen(checkAdult).unwrapErr(),
	"must be an adult",
);
assertEquals(
	parseAge("x").andThen(checkAdult).unwrapErr(),
	"not a whole number: x",
);
```

## Handle every case: `match`

To branch on the variant, use `match`. It takes one handler per variant, and
TypeScript reports a missing one. `match` lives in the core feature and works on
every enum:

```ts
import { assertEquals } from "@std/assert";
import { match } from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result";

function describe(result: Result<number, string>): string {
	return match(result)({
		Ok: (value) => `got ${value}`,
		Err: (error) => `failed: ${error}`,
	});
}

assertEquals(describe(Ok(1)), "got 1");
assertEquals(describe(Err("timeout")), "failed: timeout");
```

## Converting between them

Methods that produce another feature's type return its main class, so the chain
continues:

```ts
import { assertEquals } from "@std/assert";
import { None, Some } from "@sekhmet/enum/option";

// Option -> Result: give the missing case an error
assertEquals(
	Some(3)
		.okOr("missing")
		.map((n) => n + 1)
		.unwrapOr(0),
	4,
);
assertEquals(None<number>().okOr("missing").unwrapErr(), "missing");

// Result -> Option: keep the value, drop the error
assertEquals(Some(3).okOr("missing").ok().isSome(), true);
```

## Smaller bundles: the mini API

Every feature has a `/mini` entrypoint with the same operations as free
functions. Import from it when bundle size matters; a bundler keeps only what
you import.

```ts
import { assertEquals } from "@std/assert";
import { map, Some, unwrapOr } from "@sekhmet/enum/option/mini";

assertEquals(
	unwrapOr(
		map(Some(2), (n) => n * 10),
		0,
	),
	20,
);
```

Next: [concepts](./concepts.md) explains the model behind these types, and
[recipes](./recipes.md) collects common patterns.

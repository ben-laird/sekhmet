---
kind: tutorial
---

# Getting started

In this tutorial we will validate a club member's sign-up: a name and an age
that arrive as untrusted data. We will start with a single string, grow it into
an object, read the errors it reports, tighten it with checks, and finish by
transforming what it parses. Each step is a complete program you can run.

## Install

Add the package, and `@sekhmet/enum`, whose `Result` helpers we will use to
read what a schema returns:

```sh
deno add jsr:@sekhmet/schema jsr:@sekhmet/enum
```

On Node.js, Bun or another npm-compatible runtime, use
`npx jsr add @sekhmet/schema @sekhmet/enum` instead.

## Parse a string

First, we build a schema that accepts a string, and parse a good value with
it:

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import { string } from "@sekhmet/schema/primitives";

const name = string();
const parsed = await name.parseAsync("Ada");

assertEquals(unwrap(parsed), "Ada");
```

`parseAsync` returns a `Result`. Here it is `Ok("Ada")`, and `unwrap` takes
the value out: `"Ada"`.

Now let's give it something that isn't a string:

```ts
import { assertEquals } from "@std/assert";
import { isErr, unwrapErr } from "@sekhmet/enum/result/mini";
import { formatIssue } from "@sekhmet/schema/core";
import { string } from "@sekhmet/schema/primitives";

const name = string();
const parsed = await name.parseAsync(42);

assertEquals(isErr(parsed), true);
assertEquals(
	formatIssue(unwrapErr(parsed)),
	"Expected string, received number",
);
```

Nothing was thrown. The `Result` is an `Err`, and its error is an issue that
says what went wrong; `formatIssue` turns it into the message
`Expected string, received number`.

## Describe the member

A member has a name and an age, so we put two schemas together with `object`:

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import { object } from "@sekhmet/schema/composites";
import { number, string } from "@sekhmet/schema/primitives";

const member = object({
	shape: { name: string(), age: number() },
});
const parsed = await member.parseAsync({ name: "Ada", age: 36 });

assertEquals(unwrap(parsed), { name: "Ada", age: 36 });
```

The output is `{ name: "Ada", age: 36 }`, and TypeScript knows its type:
`{ name: string; age: number }`.

## Read every problem

Let's send a sign-up with two mistakes, a number for the name and no age at
all:

```ts
import { assertEquals } from "@std/assert";
import { unwrapErr } from "@sekhmet/enum/result/mini";
import { object } from "@sekhmet/schema/composites";
import { entries, formatIssue } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";

const member = object({
	shape: { name: string(), age: number() },
});
const issues = unwrapErr(await member.parseAsync({ name: 1 }));

const report = entries(issues).map(({ path, error }) => {
	return `${path.join(".")}: ${formatIssue(error)}`;
});

assertEquals(report, [
	"name: Expected string, received number",
	"age: Expected number, received undefined",
]);
```

Notice that both problems are reported, not just the first. An object's error
is a list of issues, and `entries` gives us each one with its `path`, the keys
that lead from the object to the value that failed:

```txt
name: Expected string, received number
age: Expected number, received undefined
```

## Add checks

A name shouldn't be empty, and an age should be a whole number that isn't
negative. Each check is an option of the schema it refines:

```ts
import { assertEquals } from "@std/assert";
import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { object } from "@sekhmet/schema/composites";
import { entries, formatIssue } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";

const member = object({
	shape: {
		name: string({ minLength: 1 }),
		age: number({ int: true, min: 0 }),
	},
});

const good = await member.parseAsync({ name: "Ada", age: 36 });
assertEquals(unwrap(good), { name: "Ada", age: 36 });

const issues = unwrapErr(await member.parseAsync({ name: "", age: 1.5 }));
const report = entries(issues).map(({ path, error }) => {
	return `${path.join(".")}: ${formatIssue(error)}`;
});

assertEquals(report, [
	"name: Too small: expected string to have >= 1 characters",
	"age: Expected integer, received number",
]);
```

The good sign-up still parses. The bad one now reports:

```txt
name: Too small: expected string to have >= 1 characters
age: Expected integer, received number
```

## Transform the result

Finally, the club wants to know whether a member is an adult. We `map` the
parsed member to a new value; the callback runs only when parsing succeeded,
so it always receives a valid member:

```ts
import { assertEquals } from "@std/assert";
import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import { object } from "@sekhmet/schema/composites";
import { number, string } from "@sekhmet/schema/primitives";

const member = object({
	shape: {
		name: string({ minLength: 1 }),
		age: number({ int: true, min: 0 }),
	},
}).map((valid) => {
	return { ...valid, adult: valid.age >= 18 };
});

const parsed = await member.parseAsync({ name: "Ada", age: 36 });
assertEquals(unwrap(parsed), { name: "Ada", age: 36, adult: true });

const rejected = await member.parseAsync({ name: "Ada", age: -1 });
assertEquals(isErr(rejected), true);
```

The output is `{ name: "Ada", age: 36, adult: true }`, while an age of `-1`
is still rejected before `map` runs.

## What we built

You have built a schema that checks a sign-up, reports every problem with its
location, and turns a valid sign-up into the value your program needs, all
without a `try`/`catch`.

From here:

- [Recipes](./recipes.md) show how to handle real inputs: JSON bodies, query
  strings and forms, API responses, IDs.
- [Concepts](./concepts.md) explain why a schema returns a `Result`, how
  issues work, and how schemas describe themselves.
- The [API reference on JSR](https://jsr.io/@sekhmet/schema/doc) lists every
  schema and option.

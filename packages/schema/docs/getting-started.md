---
kind: tutorial
---

# Getting started

In this tutorial we will validate a club member's sign-up: a name and an age
that arrive as untrusted data. We will start with a single string, grow it into
an object, read the errors it reports, tighten it with checks, and finish by
transforming what it parses. Each step is a complete program you can run.

## Install

Add the package, `@sekhmet/panic`, whose panic runtime a parse runs under
and whose `Outcome` helpers we will use to read what it returns,
`@sekhmet/vow`, whose `wait` turns a parse into a `Promise`, and
`@std/assert`, which each step uses to check its output:

```sh
deno add jsr:@sekhmet/schema jsr:@sekhmet/panic jsr:@sekhmet/vow jsr:@std/assert
```

## Parse a string

First, we build a schema that accepts a string, and parse a good value with
it:

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap } from "@sekhmet/panic/outcome/mini";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const name = string();
const parsed = await wait(name.parse({ input: "Ada", panics }));

assertEquals(unwrap(parsed), "Ada");
```

`parse` returns a `Vow` of an `Outcome`, and `wait` gives us a `Promise` of
it. Here it is `Ok("Ada")`, and `unwrap` takes the value out: `"Ada"`. The
panic runtime, `panics`, is where a bug in your own schema code would be
caught and reported, as a `Panicked` outcome instead of an `Ok` or `Err`.

Now let's give it something that isn't a string:

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { isErr, unwrapErr } from "@sekhmet/panic/outcome/mini";
import { formatIssue } from "@sekhmet/schema/core";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const name = string();
const parsed = await wait(name.parse({ input: 42, panics }));

assertEquals(isErr(parsed), true);
assertEquals(
	formatIssue(unwrapErr(parsed)),
	"Expected string, received number",
);
```

Nothing was thrown. The `Outcome` is an `Err`, and its error is an issue that
says what went wrong; `formatIssue` turns it into the message
`Expected string, received number`.

## Describe the member

A member has a name and an age, so we put two schemas together with `object`:

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import { number, string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const member = object({
	shape: { name: string(), age: number() },
});
const parsed = await wait(
	member.parse({ input: { name: "Ada", age: 36 }, panics }),
);

assertEquals(unwrap(parsed), { name: "Ada", age: 36 });
```

The output is `{ name: "Ada", age: 36 }`, and TypeScript knows its type:
`{ name: string; age: number }`.

## Read every problem

Let's send a sign-up with two mistakes, a number for the name and no age at
all:

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrapErr } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import { entries, formatIssue } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const member = object({
	shape: { name: string(), age: number() },
});
const issues = unwrapErr(
	await wait(member.parse({ input: { name: 1 }, panics })),
);

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
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import { entries, formatIssue } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const member = object({
	shape: {
		name: string({ minLength: 1 }),
		age: number({ int: true, min: 0 }),
	},
});

const good = await wait(
	member.parse({ input: { name: "Ada", age: 36 }, panics }),
);
assertEquals(unwrap(good), { name: "Ada", age: 36 });

const issues = unwrapErr(
	await wait(member.parse({ input: { name: "", age: 1.5 }, panics })),
);
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
import { definePanicRuntime } from "@sekhmet/panic";
import { isErr, unwrap } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import { number, string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const member = object({
	shape: {
		name: string({ minLength: 1 }),
		age: number({ int: true, min: 0 }),
	},
}).map((valid) => {
	return { ...valid, adult: valid.age >= 18 };
});

const parsed = await wait(
	member.parse({ input: { name: "Ada", age: 36 }, panics }),
);
assertEquals(unwrap(parsed), { name: "Ada", age: 36, adult: true });

const rejected = await wait(
	member.parse({ input: { name: "Ada", age: -1 }, panics }),
);
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
- [Concepts](./concepts.md) explain why a schema parses to an `Outcome`, how
  issues work, and how schemas describe themselves.
- The [API reference on JSR](https://jsr.io/@sekhmet/schema/doc) lists every
  schema and option.

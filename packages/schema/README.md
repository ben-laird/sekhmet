# @sekhmet/schema

`@sekhmet/schema` validates and transforms values. A `Schema<I, O, E>` wraps a
parser from an input `I` to a `Result<O, E>`, so the input, the output and the
error are all typed. A parse is a `Potential`: `Sync` when it finished at once,
`Async` when it returned a promise, so callers can tell the two apart
(`parseSync` reports an async schema as `UnexpectedAsyncParse`).

Built-in schemas fail with a `SchemaIssue`, an `Enum` describing why a value
was rejected; `formatIssue` renders it as an English message. Composite schemas
collect every failure, each with its path, as `Issues<E>`.

The package is not published yet.

## Entrypoints

Each feature has two forms:

- **Main** (`@sekhmet/schema/core`, `@sekhmet/schema/primitives`,
  `@sekhmet/schema/composites`, `@sekhmet/schema/standard`): the
  method-chaining API, `string().optional().map((s) => s?.length)`. Every
  main `Schema` has the shape modifiers `.array()`, `.optional()` and
  `.nullable()`, the transforms `.map`, `.mapErr`, `.pipe` and `.filter`, the
  Result-style transforms `.andThen`, `.orElse`, `.inspect`, `.inspectErr`
  and `.preprocess`, and `.parse`, `.parseSync` and `.parseAsync`. It is
  generated from mini by `deno task gen:main`.
- **Mini** (`@sekhmet/schema/core/mini`, `@sekhmet/schema/primitives/mini`,
  `@sekhmet/schema/composites/mini`, `@sekhmet/schema/standard/mini`):
  tree-shakable functions, `map(string(), (s) => s.length)`, with a subpath per
  module (e.g. `@sekhmet/schema/core/mini/issue`).

`@sekhmet/schema` re-exports every main entrypoint.

## Example

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import { string } from "@sekhmet/schema/primitives";

const length = string().map((text) => text.length);

assertEquals(unwrap(length.parseSync("four")), 4);
```

The same schema with mini functions:

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import { map, parseSync } from "@sekhmet/schema/core/mini";
import { string } from "@sekhmet/schema/primitives/mini";

const length = map(string(), (text) => text.length);

assertEquals(unwrap(parseSync(length, "four")), 4);
```

## Result-style transforms

Beyond `map` and `mapErr`, a schema chains like enum's `Result`: `andThen`
runs a fallible transform on the output, `orElse` recovers from a failure,
`inspect` and `inspectErr` tap a result without changing it, and `preprocess`
transforms the input before parsing. A callback may return a promise, which
makes the parse `Async`; a callback that throws panics.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
import { string } from "@sekhmet/schema/primitives";

const port = string()
	.preprocess((input: string) => input.trim())
	.andThen((text) => {
		const parsed = Number(text);
		if (Number.isInteger(parsed) && parsed > 0) {
			return Ok<number, string>(parsed);
		}

		return Err<number, string>("not a port");
	})
	.orElse(() => Ok(8080));
// {}

assertEquals(unwrap(port.parseSync(" 3000 ")), 3000);
assertEquals(unwrap(port.parseSync("http")), 8080);
```

## Checks are options

Checks and transforms are options of the schema they refine, the same in mini
and main: `number({ int: true, min: 0 })`,
`string({ trim: true, minLength: 3, format: "email" })`,
`bigint({ multipleOf: 2n })`, `date({ max: new Date() })`. A `min` or `max` is
inclusive; `{ value, inclusive: false }` excludes the bound itself. Coercion
and the transforms (`trim`, `normalize`) apply before the checks, and a
primitive reports the first check that fails.

```ts
import { assertEquals } from "@std/assert";
import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import { number, string } from "@sekhmet/schema/primitives";

const email = string({ trim: true, format: "email" });
const ratio = number({ min: 0, max: { value: 1, inclusive: false } });

assertEquals(unwrap(email.parseSync(" ada@example.com ")), "ada@example.com");
assertEquals(isErr(ratio.parseSync(1)), true);
```

## Composites

`@sekhmet/schema/composites` builds schemas from schemas: `object`, `array`,
`tuple`, `record`, `union`, `discriminatedUnion`, `enumOf`, `optional`,
`nullable` and `lazy`. Each reports every failing part as `Issues`, located by
its path from the root:

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
import { array, object } from "@sekhmet/schema/composites";
import { entries, Schema } from "@sekhmet/schema/core";

const text = new Schema((input: unknown) =>
	typeof input === "string" ? Ok(input) : Err("not text"),
);
const user = object({
	shape: { name: text, tags: array({ item: text, minItems: 1 }) },
	unknownKeys: "strict",
});

const found = unwrapErr(
	await user.parseAsync({ name: 1, tags: ["a", 2], admin: true }),
);
assertEquals(
	entries(found).map(({ path }) => path),
	[["name"], ["tags", 1], ["admin"]],
);
```

An `object` strips undeclared keys; `unknownKeys: "strict"` reports each one
and `unknownKeys: "passthrough"` keeps them. A composite is `Sync` when every
child parse is, and `Async` otherwise.

Every key of a shape is required unless its entry says
`{ schema, key: "optional" }`. `.optional()` only lets the value be
`undefined`; it doesn't make the key optional:

```ts
import { assertEquals } from "@std/assert";
import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import { object } from "@sekhmet/schema/composites";
import { string } from "@sekhmet/schema/primitives";

// { name: string; middle: string | undefined; nickname?: string }
const person = object({
	shape: {
		name: string(),
		middle: string().optional(),
		nickname: { schema: string(), key: "optional" },
	},
});

assertEquals(unwrap(person.parseSync({ name: "Ada", middle: undefined })), {
	name: "Ada",
	middle: undefined,
});
assertEquals(isErr(person.parseSync({ name: "Ada" })), true); // middle is missing
```

## Standard Schema

`@sekhmet/schema/standard` bridges to [Standard Schema](https://standardschema.dev)
v1 in both directions, with no dependency on `@standard-schema/spec` (its
types are copied locally):

- `toStandard({ schema })` exposes a schema whose input is `unknown` to any tool
  that accepts a Standard Schema. `SchemaIssue` and `Issues<SchemaIssue>`
  errors become Standard issues with `formatIssue`'s message and their path;
  any other error type needs a `toIssue` option, and the types require it.
- `fromStandard(standardSchema)` wraps a Zod, Valibot or ArkType schema (or any
  other) as a `Schema<unknown, O, Issues<StandardIssue>>`.

A sync parse stays sync and an async one async, in both directions.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
import { InvalidType, Schema } from "@sekhmet/schema/core/mini";
import { fromStandard, toStandard } from "@sekhmet/schema/standard";

const text = new Schema((input: unknown) =>
	typeof input === "string"
		? Ok(input)
		: Err(InvalidType({ input, expected: "string" })),
);
const standard = toStandard({ schema: text });

assertEquals(standard["~standard"].validate(1), {
	issues: [{ message: "Expected string, received number" }],
});
assertEquals(unwrap(await fromStandard(standard).parseAsync("a")), "a");
```

`toStandard` is a function, not a `Schema` method: main methods come from the
core feature's mini functions, and the adapter lives in its own feature.

## Design

[docs/design.md](./docs/design.md) records the accepted design: the error model
(`SchemaIssue`, `Issues`), the primitives, the declarative composites and the
Standard Schema adapter.

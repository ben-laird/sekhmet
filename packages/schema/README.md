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
  `@sekhmet/schema/standard`): the
  method-chaining API, `string().map((s) => s.length)`. It is generated from
  mini by `deno task gen:main`.
- **Mini** (`@sekhmet/schema/core/mini`, `@sekhmet/schema/primitives/mini`):
  tree-shakable functions, `map(string(), (s) => s.length)`, with a subpath per
  module (e.g. `@sekhmet/schema/core/mini/issue`).

`@sekhmet/schema` re-exports both main entrypoints.

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

## Standard Schema

`@sekhmet/schema/standard` bridges to [Standard Schema](https://standardschema.dev)
v1 in both directions, with no dependency on `@standard-schema/spec` (its
types are copied locally):

- `toStandard(schema)` exposes a schema whose input is `unknown` to any tool
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
const standard = toStandard(text);

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

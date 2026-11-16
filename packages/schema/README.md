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

- **Main** (`@sekhmet/schema/core`, `@sekhmet/schema/primitives`): the
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

## Design

[docs/design.md](./docs/design.md) records the accepted design: the error model
(`SchemaIssue`, `Issues`), the primitives, the declarative composites and the
Standard Schema adapter.

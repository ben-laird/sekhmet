# @sekhmet/schema

`@sekhmet/schema` validates and transforms values. A `Schema<I, O, E>` parses
an input `I` into a `Result<O, E>`, so the input, the output and the error
are all typed, and a failure is a value rather than a throw. The built-in
schemas fail with `SchemaIssue`s that say why a value was rejected, and
composites such as `object` report every failure with its path. Every schema
also describes itself as data, for tools like form generators, and bridges to
[Standard Schema](https://standardschema.dev) in both directions.

## Install

The package is published on [JSR](https://jsr.io/@sekhmet/schema).

```sh
deno add jsr:@sekhmet/schema
```

For Node.js, Bun and other npm-compatible runtimes, install through JSR's npm
compatibility layer:

```sh
npx jsr add @sekhmet/schema      # npm
pnpm dlx jsr add @sekhmet/schema # pnpm
yarn dlx jsr add @sekhmet/schema # yarn
bunx jsr add @sekhmet/schema     # bun
```

## Entrypoints

`@sekhmet/schema` re-exports every main entrypoint. Each feature also has a
mini entrypoint of tree-shakable functions, with a subpath per module (e.g.
`@sekhmet/schema/core/mini/issue`).

| Feature    | Main (method chaining)       | Mini (functions)                  | Holds                                                                                    |
| ---------- | ---------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| core       | `@sekhmet/schema/core`       | `@sekhmet/schema/core/mini`       | `Schema`, parsing, transforms, `SchemaIssue`, `Issues`, nodes, annotations, `is`         |
| primitives | `@sekhmet/schema/primitives` | `@sekhmet/schema/primitives/mini` | `string`, `number`, `boolean`, `stringbool`, `bigint`, `date`, `literal`…                |
| composites | `@sekhmet/schema/composites` | `@sekhmet/schema/composites/mini` | `object`, `array`, `tuple`, `record`, `union`, `discriminatedUnion`, `lazy`…             |
| algebra    | `@sekhmet/schema/algebra`    | `@sekhmet/schema/algebra/mini`    | `or`, `brand`, `readonly`, and the shape reshapers `pick`, `omit`, `partial`, `required` |
| standard   | `@sekhmet/schema/standard`   | `@sekhmet/schema/standard/mini`   | `toStandard` and `fromStandard`                                                          |

## Example

```ts
import { assertEquals } from "@std/assert";
import { unwrap, unwrapErr } from "@sekhmet/enum/result/mini";
import { object } from "@sekhmet/schema/composites";
import { entries, formatIssue } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";

const member = object({
	shape: {
		name: string({ trim: true, minLength: 1 }),
		age: number({ int: true, min: 0 }),
	},
});

assertEquals(unwrap(await member.parseAsync({ name: " Ada ", age: 36 })), {
	name: "Ada",
	age: 36,
});

const issues = unwrapErr(await member.parseAsync({ name: "", age: 1.5 }));
assertEquals(
	entries(issues).map(({ path, error }) => [path, formatIssue(error)]),
	[
		[["name"], "Too small: expected string to have >= 1 characters"],
		[["age"], "Expected integer, received number"],
	],
);
```

## Learn more

- **Tutorial:** [Getting started](./docs/getting-started.md) builds a schema
  step by step, from one string to a checked, transformed object.
- **How-to guides:** [Recipes](./docs/recipes.md) for validating JSON bodies,
  reading query strings and forms, parsing API responses, branding IDs,
  reshaping objects, recursive data, type guards, form labels and Standard
  Schema.
- **Explanation:** [Concepts](./docs/concepts.md) covers why a schema returns
  a `Result`, issues as data, strict primitives, checks as options, main and
  mini, sync and async, and schemas that describe themselves.
- **Reference:** the [API reference on JSR](https://jsr.io/@sekhmet/schema/doc)
  documents every schema, option and issue.

## Design record

The
[decision record](https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/schema.md)
keeps the history of the package's design decisions and the alternatives they
replaced.

## License

MIT. See
[LICENSE.md](https://github.com/ben-laird/sekhmet/blob/main/packages/schema/LICENSE.md).

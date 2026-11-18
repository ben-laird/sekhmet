# @sekhmet/schema

`@sekhmet/schema` validates and transforms values. A `Schema<I, O, E>` holds a
parser from an input `I` to a `Result<O, E>`, so the input, the output and the
error are all typed; it also carries what it is, as a `SchemaNode`, and typed
annotations (see [Schemas describe themselves](#schemas-describe-themselves)).
Build one by hand with `new Schema({ parse })`. A parse is a `Potential`: `Sync` when it finished at once,
`Async` when it returned a promise, so callers can tell the two apart
(`parseSync` reports an async schema as `UnexpectedAsyncParse`).

Built-in schemas fail with a `SchemaIssue`, an `Enum` describing why a value
was rejected; `formatIssue` renders it as an English message. Composite schemas
collect every failure, each with its path, as `Issues<E>`.

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

Each feature has two forms:

- **Main** (`@sekhmet/schema/core`, `@sekhmet/schema/primitives`,
  `@sekhmet/schema/composites`, `@sekhmet/schema/standard`,
  `@sekhmet/schema/algebra`): the method-chaining API,
  `string().optional().map((s) => s?.length)`. Every main `Schema` has the
  shape modifiers `.array()`, `.optional()` and `.nullable()`, the transforms
  `.map`, `.mapErr`, `.pipe` and `.filter`, the Result-style transforms
  `.andThen`, `.orElse`, `.inspect`, `.inspectErr` and `.preprocess`,
  `.parse`, `.parseSync` and `.parseAsync`, `.annotate`, and the
  [algebra](#algebra) behind `.with`. It is generated from mini by `deno task gen:main`.
- **Mini** (`@sekhmet/schema/core/mini`, `@sekhmet/schema/primitives/mini`,
  `@sekhmet/schema/composites/mini`, `@sekhmet/schema/standard/mini`,
  `@sekhmet/schema/algebra/mini`):
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
makes the parse `Async`; a callback that throws panics. Like `andThen`'s,
`filter({ predicate, error })`'s error adds to the schema's: filtering a
`Schema<I, O, E>` with an `error` returning `F` fails with `E | F`.

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
and the transforms (`trim`, `normalize`, then `case: "lower" | "upper"`) apply
before the checks, and a primitive reports the first check that fails. A
string can also require a prefix or suffix:
`string({ case: "lower", startsWith: "v", endsWith: ".json" })`. The time
formats take their options in place of the name:
`string({ format: { name: "date-time", precision: 3, offset: "allowed" } })`
wants exactly milliseconds, with or without a UTC offset, and
`offset: "forbidden"` wants a local time.

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

const text = new Schema({
	parse: (input: unknown) => {
		return typeof input === "string" ? Ok(input) : Err("not text");
	},
});
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

## Algebra

`@sekhmet/schema/algebra` combines and retypes whole schemas. On a main
`Schema` they sit behind `.with`, and each returns a main `Schema`:

- `.with.or(right)` (mini `or({ left, right })`) tries this schema, then
  `right`: a `union` of the two. Chains flatten: `a.with.or(b).with.or(c)`
  and `union([a, b]).with.or(c)` are both `union([a, b, c])`; a union with
  annotations stays one branch.
- `.with.brand("UserId")` (mini `brand(self, "UserId")`) brands the output
  type `Branded<O, "UserId">`, so only a parsed value has it. The brand is
  type-only: nothing changes at runtime.
- `.with.readonly()` (mini `readonly(self)`) freezes a shallow copy of an
  array or plain object output (never the input itself) and types it
  `ReadonlyOutput<O>`.

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import type { Branded } from "@sekhmet/schema/algebra";
import { number, string } from "@sekhmet/schema/primitives";

type UserId = Branded<string, "UserId">;

const userId = string().with.or(number()).map(String).with.brand("UserId");
const ids = userId.array().with.readonly();

const parsed: readonly UserId[] = unwrap(ids.parseSync(["u1", 2]));
assertEquals<readonly string[]>(parsed, ["u1", "2"]);
assertEquals(Object.isFrozen(parsed), true);
```

The shape reshapers are plain functions from one `object` shape to another:
`pick({ shape, keys })`, `omit({ shape, keys })`, `partial(shape)` (every key
optional) and `required(shape)` (every key required, an `.optional()` value
still accepting `undefined`). Extend a shape with a spread, and declare a
standalone shape `satisfies Shape` so its `key: "optional"` stays literal:

```ts
import { assertEquals } from "@std/assert";
import { isErr, unwrap } from "@sekhmet/enum/result/mini";
import { omit, partial } from "@sekhmet/schema/algebra";
import { object, type Shape } from "@sekhmet/schema/composites";
import { string } from "@sekhmet/schema/primitives";

const account = {
	name: string(),
	password: string(),
	nickname: { schema: string(), key: "optional" },
} satisfies Shape;

const visible = object({ shape: omit({ shape: account, keys: ["password"] }) });
const patch = object({ shape: partial({ ...account, email: string() }) });

assertEquals(unwrap(visible.parseSync({ name: "Ada", password: "x" })), {
	name: "Ada",
});
assertEquals(unwrap(patch.parseSync({ email: "ada@example.com" })), {
	email: "ada@example.com",
});
assertEquals(isErr(patch.parseSync({ name: undefined })), true);
```

There is no `and`: a shape spread, options, `filter` or `andThen` covers each
use of an intersection.

## Typed sub-schemas

A schema built from other schemas exposes them, typed exactly as you passed
them: `object(…).shape`, `array(…).item` (and `.array().item`),
`tuple(…).items`, `record(…).key` and `.value`, `union(…).options`,
`discriminatedUnion(…).key` and `.options`, `.optional()`, `.nullable()` and
`.with.readonly()`'s `.inner`, `lazy(…).getter`, every transform's `.inner`
(`.map`, `.filter`, `.andThen`, …), and `.pipe(next)`'s `.inner` and
`.next`. A field entry stays an entry (`.shape.age.schema`), a child keeps
its own view, and `.with.brand()` and `.annotate()` keep the view they were
called on:

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import { partial } from "@sekhmet/schema/algebra";
import { object } from "@sekhmet/schema/composites";
import { title } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";

const user = object({
	shape: {
		name: string({ minLength: 1 }),
		age: { schema: number({ int: true }), key: "optional" },
		tags: string().array(),
	},
}).annotate([title("User")]);

assertEquals(unwrap(user.shape.name.parseSync("Ada")), "Ada");
assertEquals(user.shape.age.key, "optional");
assertEquals(unwrap(user.shape.tags.item.parseSync("admin")), "admin");

// A transform's view is its receiver; the receiver's view is one step in.
const named = user.map((value) => value.name).optional();
assertEquals(named.inner.inner, user);

// Reshape an existing object through its typed shape.
const patch = object({ shape: partial(user.shape) });
assertEquals(unwrap(patch.parseSync({})), {});
```

A view is own properties holding the same children the schema's node holds;
it adds no state. Give a composite of your own typed children with
`viewed({ init, view })` and a `custom()` node. A view can't use a main
`Schema` member, `schema` or a symbol as a key. See
[Typed sub-schemas](docs/design.md#typed-sub-schemas-37) in the design.

## Schemas describe themselves

Every schema carries what it is as data, its `SchemaNode`, read with
`nodeOf(schema)` and walked with `children(node)`. A built-in schema records
its kind with its options as passed (`string({ minLength: 1 })` is a `Leaf`
of `{ type: "string", options: { minLength: 1 } }`), a composite its
children, and a transform its step and the schema it transforms (never the
callback). A schema built with `new Schema({ parse })` alone is `Opaque`; a
schema from outside the package can describe itself with a kind of its own
(`nodeKind`, `custom`, `customData`).

Schemas also carry typed annotations. Define a key with `annotationKey<T>`,
call it to annotate (`.annotate([label("Name")])`), and read it back with
`annotation({ schema, key })`, an `Option<T>`. A later annotation for a key
wins. Every other operation starts with none, except `.with.brand`, which
returns its schema as is, so its annotations survive; `Schema.fromMini` is a
view of the same schema, not an operation, so it keeps them too. Lookup falls
back through `.optional()`, `.nullable()` and `.with.readonly()` only. `description` and
`title` are the well-known keys. A form generator reads its labels from an
object's shape:

```ts
import { assertEquals } from "@std/assert";
import { union } from "@sekhmet/enum/core/mini/exit";
import { isolate } from "@sekhmet/enum/core/mini/isolate";
import { unwrapOr } from "@sekhmet/enum/option/mini";
import { object } from "@sekhmet/schema/composites";
import {
	annotation,
	annotationKey,
	description,
	nodeOf,
} from "@sekhmet/schema/core";
import { string } from "@sekhmet/schema/primitives";

const label = annotationKey<string>({ name: "label" });
const signUp = object({
	shape: {
		name: string({ minLength: 1 }).annotate([label("Full name")]),
		email: string({ format: "email" }).annotate([
			label("Email"),
			description("Where we send your receipt"),
		]),
		referrer: string()
			.annotate([label("Who sent you?")])
			.optional(),
		// {}
	},
});

const node = nodeOf(signUp);
const labels: string[] = [];
if (isolate(node, "Object")) {
	for (const [key, entry] of Object.entries(union(node).shape)) {
		const schema = "schema" in entry ? entry.schema : entry;
		labels.push(unwrapOr(annotation({ schema, key: label }), key));
	}
}

assertEquals(labels, ["Full name", "Email", "Who sent you?"]);
```

## Type guards

`is(schema)` turns a schema into a type guard, `(input: I) => input is O & I`,
for an `if`, `Array.prototype.filter`, or `filter({ predicate })`:

```ts
import { assertEquals } from "@std/assert";
import { is } from "@sekhmet/schema/core";
import { number } from "@sekhmet/schema/primitives";

const values: (string | number)[] = ["a", 1, "b", 2];
const numbers: number[] = values.filter(is(number()));

assertEquals(numbers, [1, 2]);
```

A guard is sound only for a schema that doesn't transform (its output is the
input itself). `string({ trim: true, maxLength: 1 })` accepts `" a "`, which is
three characters long, and `number({ coerce: true })` accepts `"42"`, which the
guard then calls a `number`. To use a transformed value, parse it and keep the
output. A guard parses with `parseSync`, so a schema that parses
asynchronously panics: an async schema can't answer a synchronous guard.

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

const text = new Schema({
	parse: (input: unknown) => {
		if (typeof input === "string") return Ok(input);

		return Err(InvalidType({ input, expected: "string" }));
	},
});
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
(`SchemaIssue`, `Issues`), the primitives, the declarative composites, the
Standard Schema adapter, the algebra, how schemas describe themselves, and
type guards.

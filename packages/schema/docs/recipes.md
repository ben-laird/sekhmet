---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when an app takes data from outside.
Each one uses the main (method-chaining) API; every method has a mini
function of the same name in the feature's `/mini` entrypoint. For every
schema and option, see the [API reference](https://jsr.io/@sekhmet/schema/doc).

## How to validate a JSON request body

This guide shows you how to turn a request body, as text, into a typed value
or a list of messages to send back.

1. Wrap `JSON.parse`, which throws, in a schema from `string` to `unknown`
   that fails with `Issues` instead.
2. Describe the body with `object`. Use `unknownKeys: "strict"` if extra
   fields should be rejected rather than dropped.
3. `pipe` the two, so the object schema runs on the parsed JSON.
4. On failure, render each entry of the `Issues` with `formatIssue`.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import {
	Custom,
	entries,
	formatIssue,
	fromError,
	type Issues,
	Schema,
	type SchemaIssue,
} from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const json = new Schema({
	parse: (text: string) => {
		try {
			return Ok<unknown, Issues<SchemaIssue>>(JSON.parse(text));
		} catch {
			const issue = Custom({ input: text, message: "Invalid JSON" });
			return Err<unknown, Issues<SchemaIssue>>(fromError(issue));
		}
	},
});
const order = object({
	shape: {
		sku: string({ minLength: 1 }),
		quantity: number({ int: true, min: 1 }),
	},
	unknownKeys: "strict",
});
const body = json.pipe(order);

const messages = (issues: Issues<SchemaIssue>): string[] => {
	return entries(issues).map(({ path, error }) => {
		return `${path.join(".") || "(body)"}: ${formatIssue(error)}`;
	});
};

assertEquals(
	unwrap(
		await wait(body.parse({ input: '{"sku":"A1","quantity":2}', panics })),
	),
	{
		sku: "A1",
		quantity: 2,
	},
);
assertEquals(
	messages(unwrapErr(await wait(body.parse({ input: "{", panics })))),
	["(body): Invalid JSON"],
);
assertEquals(
	messages(
		unwrapErr(
			await wait(
				body.parse({ input: '{"sku":"","quantity":0,"x":1}', panics }),
			),
		),
	),
	[
		"sku: Too small: expected string to have >= 1 characters",
		"quantity: Too small: expected number to be >= 1",
		'x: Unknown key "x"',
	],
);
```

To return a single message instead, take the first entry. To show issues in
another language, `match` on each `SchemaIssue` variant instead of calling
`formatIssue`; the variants are listed on
[`SchemaIssue`](https://jsr.io/@sekhmet/schema/doc/core/~/SchemaIssue).

## How to read query-string and form values

Query strings, form fields and environment variables arrive as strings. This
guide shows you how to read them as numbers and booleans.

- For a number, use `number({ coerce: true })`. It accepts `" 12 "` and
  `"1e3"`, and rejects `""`, which `Number()` would read as `0`.
- For a boolean, use `stringbool()`. It reads `true`/`false`, `1`/`0`,
  `yes`/`no`, `on`/`off`, `y`/`n` and `enabled`/`disabled`, trimmed and in
  any case, and rejects any other word.
- For a missing parameter, make the key optional with
  `{ schema, key: "optional" }`.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { isErr, unwrap } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import { number, string, stringbool } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const search = object({
	shape: {
		q: string({ trim: true, minLength: 1 }),
		page: {
			schema: number({ coerce: true, int: true, min: 1 }),
			key: "optional",
		},
		archived: { schema: stringbool(), key: "optional" },
	},
});
const read = (query: string) => {
	return wait(
		search.parse({
			input: Object.fromEntries(new URLSearchParams(query)),
			panics,
		}),
	);
};

assertEquals(unwrap(await read("q=+tea+&page=2&archived=yes")), {
	q: "tea",
	page: 2,
	archived: true,
});
assertEquals(unwrap(await read("q=tea")), { q: "tea" });
assertEquals(isErr(await read("q=tea&page=")), true);
assertEquals(isErr(await read("q=tea&archived=maybe")), true);
```

If a form uses other words for a checkbox, pass them:
`stringbool({ truthy: ["checked"], falsy: ["unchecked"] })`. A list you pass
replaces that default list rather than adding to it, so if `yes` and `no`
must still work, list them too, or spread the defaults that
`@sekhmet/schema/primitives` exports: `truthy: [...STRINGBOOL_TRUTHY, "checked"]`. If you need
JavaScript's own conversions, traps included, use `coerce: "native"`; the
coercion modes are listed on
[`CoerceMode`](https://jsr.io/@sekhmet/schema/doc/primitives/~/CoerceMode).

## How to parse an API response with several shapes

When a response has a field that says which shape it is, use
`discriminatedUnion`. It reads the field first and parses with that case's
schema only, so a failure reports that case's issues rather than every
case's.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap, unwrapErr } from "@sekhmet/panic/outcome/mini";
import { array, discriminatedUnion, object } from "@sekhmet/schema/composites";
import { entries, formatIssue } from "@sekhmet/schema/core";
import { number, string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const response = discriminatedUnion({
	key: "status",
	options: {
		ok: object({ shape: { items: array({ item: string() }) } }),
		error: object({
			shape: { code: number({ int: true }), message: string() },
		}),
	},
});

assertEquals(
	unwrap(
		await wait(
			response.parse({ input: { status: "ok", items: ["a"] }, panics }),
		),
	),
	{
		status: "ok",
		items: ["a"],
	},
);

const failed = unwrapErr(
	await wait(response.parse({ input: { status: "teapot" }, panics })),
);
assertEquals(
	entries(failed).map(({ path, error }) => [path, formatIssue(error)]),
	[[["status"], 'Expected one of "ok", "error"']],
);
```

Narrow the output on the key: after `if (value.status === "ok")`, TypeScript
knows `value.items` exists. When the cases share no such field, use
`union([a, b])` (or `a.with.or(b)`), which tries each in turn and fails with
one `InvalidUnion` holding every branch's issues.

## How to brand an ID type

When two IDs are both strings, a brand stops one being passed for the other.
Brand the schema's output with `.with.brand`; only a value parsed by that
schema has the branded type.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap } from "@sekhmet/panic/outcome/mini";
import type { Branded } from "@sekhmet/schema/algebra";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

type UserId = Branded<string, "UserId">;

const userId = string({ startsWith: "u_" }).with.brand("UserId");

const findUser = (id: UserId): string => `user ${id}`;

const id = unwrap(await wait(userId.parse({ input: "u_42", panics })));
assertEquals(findUser(id), "user u_42");

// @ts-expect-error: a plain string is not a UserId
findUser("u_42");
```

The brand is type-only: at runtime the value is the string itself. To keep a
parsed array or object from being changed, add `.with.readonly()`, which
freezes a shallow copy of the output.

## How to reuse and reshape object schemas

This guide shows you how to build related object schemas (a record, its
public view, an update patch) from one shape.

1. Declare the shape on its own, `satisfies Shape`, so its optional keys stay
   optional in the types.
2. Build each schema from it with the reshapers: `pick`, `omit`, `partial`
   (every key optional) and `required` (every key required).
3. Extend a shape with an object spread.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { isErr, unwrap } from "@sekhmet/panic/outcome/mini";
import { omit, partial } from "@sekhmet/schema/algebra";
import { object, type Shape } from "@sekhmet/schema/composites";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const account = {
	name: string({ minLength: 1 }),
	password: string({ minLength: 8 }),
	nickname: { schema: string(), key: "optional" },
} satisfies Shape;

const stored = object({ shape: { ...account, id: string() } });
const visible = object({ shape: omit({ shape: account, keys: ["password"] }) });
const patch = object({ shape: partial(account) });

assertEquals(
	isErr(
		await wait(stored.parse({ input: { name: "Ada", password: "x" }, panics })),
	),
	true,
);
assertEquals(
	unwrap(
		await wait(
			visible.parse({ input: { name: "Ada", password: "secret!!" }, panics }),
		),
	),
	{
		name: "Ada",
	},
);
assertEquals(
	unwrap(await wait(patch.parse({ input: { nickname: "ada" }, panics }))),
	{
		nickname: "ada",
	},
);
```

If you already have the object schema, its `.shape` is the shape it was built
from, typed: `partial(stored.shape)`. Note that `string().optional()` lets a
value be `undefined` but still requires the key; only
`{ schema, key: "optional" }` lets the key be missing.

## How to validate a recursive structure

For a tree, a comment thread or nested menus, refer to the schema from inside
itself through `lazy`, and annotate the schema's type, which TypeScript can't
infer for a recursive value.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { isErr, unwrap } from "@sekhmet/panic/outcome/mini";
import { array, lazy, object } from "@sekhmet/schema/composites";
import type { Issues, Schema, SchemaIssue } from "@sekhmet/schema/core";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

interface Comment {
	text: string;
	replies: Comment[];
}

const comment: Schema<unknown, Comment, Issues<SchemaIssue>> = object({
	shape: {
		text: string(),
		replies: array({ item: lazy(() => comment) }),
	},
});

const thread = { text: "a", replies: [{ text: "b", replies: [] }] };
assertEquals(
	unwrap(await wait(comment.parse({ input: thread, panics }))),
	thread,
);
assertEquals(
	isErr(
		await wait(comment.parse({ input: { text: "a", replies: [{}] }, panics })),
	),
	true,
);
```

## How to convert a parsed value with a step that can fail

When a parsed value still has to be converted, and the conversion can fail,
chain the `Result`-style transforms:

- `andThen` runs a step that returns a `Result`; its error adds to the
  schema's.
- `orElse` replaces a failure, for a default.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap } from "@sekhmet/panic/outcome/mini";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const port = string({ trim: true })
	.andThen((text) => {
		const parsed = Number(text);
		if (Number.isInteger(parsed) && parsed > 0) {
			return Ok<number, string>(parsed);
		}

		return Err<number, string>("not a port");
	})
	.orElse(() => Ok(8080));
// {}

assertEquals(unwrap(await wait(port.parse({ input: " 3000 ", panics }))), 3000);
assertEquals(unwrap(await wait(port.parse({ input: "http", panics }))), 8080);
```

A callback may return a promise, which makes the parse asynchronous. For a
check that only keeps or rejects the value, `.filter({ predicate, error })`
is shorter than `andThen`.

## How to adjust the input before parsing

When the input arrives in a different form from the one a schema parses,
such as a comma-separated list where the schema expects an array, convert it
first with `preprocess`. Its callback receives the raw input, so its
parameter type becomes the new schema's input type.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { isErr, unwrap } from "@sekhmet/panic/outcome/mini";
import { string } from "@sekhmet/schema/primitives";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const tags = string({ trim: true, minLength: 1 })
	.array()
	.preprocess((input: string) => input.split(","));
// {}

assertEquals(unwrap(await wait(tags.parse({ input: "tea, cake", panics }))), [
	"tea",
	"cake",
]);
assertEquals(
	isErr(await wait(tags.parse({ input: "tea,,cake", panics }))),
	true,
);
```

The callback can't fail; a callback that throws panics. If the conversion
can fail, write it as a schema of its own and `pipe` it into the next, as in
[How to validate a JSON request body](#how-to-validate-a-json-request-body).

## How to use a schema as a type guard

To narrow a value in an `if` or a `filter` call, make a guard with `is`:

```ts
import { assertEquals } from "@std/assert";
import { is } from "@sekhmet/schema/core";
import { number } from "@sekhmet/schema/primitives";
import { definePanicRuntime } from "@sekhmet/panic";

const panics = definePanicRuntime();

const values: (string | number)[] = ["a", 1, "b", 2];
const numbers: number[] = values.filter(is(number(), { panics }));

assertEquals(numbers, [1, 2]);
```

Only guard with a schema that doesn't transform. `number({ coerce: true })`
accepts `"42"`, and the guard would then call that string a number; parse and
keep the output instead. A guard can't use a schema that parses
asynchronously: it panics.

## How to label form fields from a schema

To keep labels and help text next to the fields they describe, annotate the
schemas and read the annotations back when you render the form.

1. Define a key with `annotationKey<T>`, or use the built-in `title` and
   `description`.
2. Annotate each field: `.annotate([label("Email")])`.
3. Walk the object's node and read each field's annotation with
   `annotation({ schema, key })`, which returns an `Option`.

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

A field without the annotation falls back to its key. An annotation survives
`.optional()`, `.nullable()` and `.with.readonly()`, but not a transform such
as `.map`: annotate after the transform.

## How to work with Standard Schema libraries

[Standard Schema](https://standardschema.dev) is the interface that Zod,
Valibot, ArkType and many form and router libraries share.

- To hand a schema to a tool that accepts a Standard Schema, wrap it with
  `toStandard({ schema, panics })`, with the panic runtime it parses under:
  a panic is reported, then thrown out of `validate`. The schema's input must
  be `unknown`. If its error isn't a `SchemaIssue` or `Issues<SchemaIssue>`,
  also pass `toIssue`, which turns your error into a message.
- To use a schema from another library inside a sekhmet schema, wrap it
  with `fromStandard(other)`. It fails with `Issues<StandardIssue>`.

```ts
import { assertEquals } from "@std/assert";
import { definePanicRuntime } from "@sekhmet/panic";
import { unwrap } from "@sekhmet/panic/outcome/mini";
import { object } from "@sekhmet/schema/composites";
import { string } from "@sekhmet/schema/primitives";
import { fromStandard, toStandard } from "@sekhmet/schema/standard";
import { wait } from "@sekhmet/vow";

const panics = definePanicRuntime();

const user = object({ shape: { name: string() } });
const standard = toStandard({ schema: user, panics });

assertEquals(standard["~standard"].validate({ name: 1 }), {
	issues: [{ message: "Expected string, received number", path: ["name"] }],
});

// Any Standard schema, such as a Zod or Valibot one, wraps the same way.
const wrapped = fromStandard(standard);
assertEquals(
	unwrap(await wait(wrapped.parse({ input: { name: "Ada" }, panics }))),
	{
		name: "Ada",
	},
);
```

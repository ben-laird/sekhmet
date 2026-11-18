---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/schema`, and why it is built the way it is. The
[recipes](./recipes.md) show how to put them to work; the
[decision record](https://github.com/ben-laird/sekhmet/blob/main/docs/decisions/schema.md)
keeps the history of each decision, including the alternatives it replaced.

## A schema is a parser to a `Result`

A `Schema<I, O, E>` turns an input `I` into either an output `O` or an error
`E`, returned as a `Result<O, E>`. All three are typed. Most validation
libraries type only the output: they take `unknown` and throw, or return a
failure whose shape is fixed by the library.

Typing the error follows from treating failure as an ordinary outcome. Bad
input is the normal case for a schema, not an exceptional one, so it belongs
in the return type, where the compiler makes the caller deal with it, rather
than in a `throw` that nothing in the signature mentions. In this package a
throw means a bug: a callback that throws, or an async schema used where only
a synchronous answer will do, panics.

Typing the input lets schemas chain. A schema need not start from `unknown`:
one can parse JSON text into `unknown`, and `pipe` hands its output to the
next. The compiler checks that each step accepts what the previous one
produces.

```ts
import { assertEquals } from "@std/assert";
import { Err, Ok, unwrap } from "@sekhmet/enum/result/mini";
import { Schema } from "@sekhmet/schema/core";

// A Schema<string, number, string>, written by hand.
const digits = new Schema({
	parse: (input: string) => {
		return /^\d+$/.test(input) ? Ok(Number(input)) : Err("not digits");
	},
});

assertEquals(unwrap(await digits.parseAsync("42")), 42);
```

Because the input and the error are typed, a sekhmet schema says more than a
[Standard Schema](https://standardschema.dev), whose input is `unknown` and
whose issues are messages. The `standard` feature converts between the two
when a tool expects the common interface.

## Issues are data, not messages

The built-in schemas fail with a `SchemaIssue`: an enum whose variant says
what went wrong (`InvalidType`, `TooSmall`, `UnknownKey`…) and whose details
carry what a message needs, such as the bound that was missed or the type that
was received. Every issue keeps the input it rejected.

Keeping the reason as data, and the wording apart in `formatIssue`, lets each
caller decide what to say. A form highlights a field and translates the
message; an API returns a code; a log records the details. None of them has to
parse an English sentence back into a reason.

Composite schemas (`object`, `array`, `union`…) don't stop at the first
problem. They fail with `Issues<E>`, every failure from every child, each with
the path from the root to the value that failed. A user fixing a form wants
every mistake at once, not one per submit. A child's `Issues` is flattened
into its parent's, with the child's key prepended to each path, so however
deep the structure, the result is one flat list.

A schema you write yourself may fail with any `E`; only the built-in ones fix
it to `SchemaIssue`. A composite of your schemas fails with `Issues` of
yours.

## Strict by default

A primitive accepts only its own type. `number()` rejects the string `"42"`,
and also `NaN` and `±Infinity`, which are numbers to JavaScript but rarely
what a field means. Silent conversion hides bugs: `Number("")` is `0`, and
`Boolean("false")` is `true`.

Conversion is something you ask for, and it comes in two modes, named for
what they do. `coerce: true` converts only what unambiguously means a value
of the type, so `" 12 "` becomes `12` while `""` still fails. `coerce:
"native"` uses JavaScript's own `Number()`, `String()` or `Boolean()`, traps
included, for when that is the behavior you want. Booleans from text get
their own schema, `stringbool()`, because a word list (`yes`, `off`,
`enabled`…) is a different question from converting arbitrary values.

## Checks are options

A check is an option of the schema it refines: `number({ int: true, min: 0 })`,
`string({ trim: true, format: "email" })`. It is not a method you chain
(`string().min(3)`) or a function you wrap around the schema.

Options are a description, so the schema can keep them. The schema records
them as passed, which is what lets tools read a schema without running it
(see [Schemas describe themselves](#schemas-describe-themselves)). Options
also read the same in both APIs, and give each check one spelling. A `Bound`
is a bare value when inclusive (`min: 0`) and `{ value, inclusive: false }`
when not, so one field per side can't hold two bounds that contradict each
other.

Options also fix the order. Coercion runs first, then the transforms (`trim`,
`normalize`, `case`), then the checks, on the transformed value. A primitive
reports the first check that fails, in a documented order; a composite
reports every child that fails. A check on a
value you have mapped is a `filter`, because only you know what the mapped
value means.

## Main and mini

Each feature comes in two forms. Mini is a set of functions,
`map(string(), f)`, that a bundler can drop when they are unused. Main is the
same schemas with methods, `string().map(f)`, which reads better when bundle
size matters less. Main is generated from mini, so the two can't drift apart.

```ts
import { assertEquals } from "@std/assert";
import { unwrap } from "@sekhmet/enum/result/mini";
import { map, parseSync } from "@sekhmet/schema/core/mini";
import { string } from "@sekhmet/schema/primitives";
import { string as miniString } from "@sekhmet/schema/primitives/mini";

const viaMain = string().map((text) => text.length);
const viaMini = map(miniString(), (text) => text.length);

assertEquals(unwrap(viaMain.parseSync("four")), 4);
assertEquals(unwrap(parseSync(viaMini, "four")), 4);
```

Methods are kept for what reads as a chain: the shape modifiers (`.array()`,
`.optional()`, `.nullable()`), the transforms (`.map`, `.filter`, `.andThen`
and the rest), parsing, `.annotate`, and the algebra behind `.with`.
Everything else stays a function, even in main. `is(schema)` builds a guard
you pass around (`values.filter(is(number()))`), which a method would have to
be bound for. `toStandard` lives in its own feature, so the core `Schema` type
doesn't take on the Standard Schema interface.

## Sync and async

A schema's parser may return a `Result` or a promise of one. `parse` reports
which as a `Potential`: `Sync` when the parse finished at once, `Async` when
it returned a promise. A composite is `Sync` when every child's parse is, so
an object of built-in schemas never pays for a promise.

```ts
import { assertEquals } from "@std/assert";
import { unionKinds } from "@sekhmet/enum/core/mini/exit";
import { Ok } from "@sekhmet/enum/result/mini";
import { parse, Schema } from "@sekhmet/schema/core/mini";

const now = new Schema({ parse: (input: string) => Ok(input) });
const later = new Schema({
	parse: (input: string) => Promise.resolve(Ok(input)),
});

assertEquals(unionKinds(parse(now, "a")), "Sync");
assertEquals(unionKinds(parse(later, "a")), "Async");
```

Most libraries choose for you: everything is a promise, or async schemas
throw when parsed synchronously. Here the caller chooses. `parseAsync` works
for every schema. `parseSync` answers at once, and reports an async schema as
an `UnexpectedAsyncParse` error rather than blocking or guessing. A type guard
can't return an error, so `is` panics on an async schema instead.

## Schemas describe themselves

Every schema carries what it is as data, its `SchemaNode`: a `Leaf` with the
primitive's type and options, an `Object` with its shape, a `Transform`
naming its step and the schema it transforms, and so on. `nodeOf` reads it
and `children` walks it. A schema can also carry typed annotations, such as a
`title`, a `description` or a key of your own made with `annotationKey`.

This is what lets a tool use a schema without parsing anything: a form
generator reads labels and field types, and a JSON Schema exporter (planned)
reads the options. Some choices follow from that purpose:

- **No node holds a callback.** A function can't be read or serialized, so a
  `map` records that it is a map, not what it does. A schema built with
  `new Schema({ parse })` alone is `Opaque`, since there is nothing to
  describe. A schema from outside the package can describe itself with a kind
  of its own (`nodeKind`, `custom`).
- **Annotations live in the schema, not in a registry.** A registry keyed by
  schema is module-level state: invisible in the value, and lost when the
  schema is copied.
- **Annotations are keyed, not typed into `Schema`.** A fourth type parameter
  would thread through every signature for data that only tools read. A typed
  key gives the same safety where the value is read.
- **Annotations describe the schema they are on.** An operation that makes a
  new schema starts without them, since a mapped output is another value.
  Reading one looks through `.optional()`, `.nullable()` and
  `.with.readonly()`, so a field's label survives being made optional.

A schema built from others also exposes them, typed as you passed them:
`object(…).shape`, `array(…).item`, a transform's `.inner`. That makes an
existing schema something to build from (`partial(user.shape)`), not only to
parse with.

## Why there is no `and`

The algebra has `or` (a union), `brand` and `readonly`, but no intersection.
Each use of one is covered by something more direct: spread two shapes into
one `object` to combine fields, add options to tighten a primitive, and use
`filter` or `andThen` for a rule that spans fields. An intersection of two
arbitrary schemas would also have to merge their two outputs, and there is no
good general rule for merging two different values.

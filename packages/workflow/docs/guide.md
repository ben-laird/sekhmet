# Workflow helpers guide

This guide covers the helpers in `@sekhmet/workflow`: when to use each, the
exact messages they panic with, their causes, and how to recognize them.

All of them panic through [`@sekhmet/panic`](https://jsr.io/@sekhmet/panic). A panic means
the program is wrong, never that input was bad: return a `Result` for an
expected failure. Run your program inside a panic runtime
(`definePanicRuntime()`) and its hook reports these panics like any other.

## Choosing a helper

| The code…                                  | Use              |
| ------------------------------------------ | ---------------- |
| is not written yet, but will be            | `todo`           |
| is deliberately not supported              | `unimplemented`  |
| cannot run unless the types lie            | `unreachable`    |
| relies on a condition only a bug can break | `invariant`      |
| relies on two values being equal           | `invariantEqual` |
| relies on a value being present            | `defined`        |
| relies on a value passing a predicate      | `satisfies`      |

## Messages

Every message opens with a header line. The lines after it appear only when
their part was given, so a call without options panics with the header alone.

### `todo` and `unimplemented`

The header, then the description with its tracking URL, then the checklist:

```txt
a code path that is not implemented yet was executed
Todo: parse the config file (tracked at https://example.com/issues/1)
  - [x] read the file
  - [ ] validate it
```

`unimplemented` has the same layout under its own header and label:

```txt
a code path that is deliberately not implemented was executed
Unimplemented: writing to a read-only store
```

With a tracking URL but no description, the URL gets a line of its own:
`Tracked at https://example.com/issues/1`. A subtask without `complete` is
not done.

### `unreachable`

```txt
an unreachable code path was executed
Impossible value: { kind: "triangle" }
Please file an issue at https://example.com/issues
```

The `Impossible value` line appears exactly when the call passed `value`, even
if that value is `undefined`.

### `invariant`

```txt
an invariant was violated
Expected behavior: the cart should never be empty at checkout
Please file an issue at https://example.com/issues
```

Write `expectedBehavior` as a "should" statement about the program, so the
message reads as what went wrong.

### `invariantEqual`

The `invariant` layout, with both values rendered:

```txt
an invariant was violated
Expected behavior: every key should have a value
Actual value: 1
Expected value: 2
```

### `defined` and `satisfies`

Both use the `invariant` layout, with a line for the offending value, rendered
like the impossible value of `unreachable`:

```txt
an invariant was violated
Expected behavior: every item in the cart should have a price
Absent value: undefined
```

```txt
an invariant was violated
Expected behavior: a quantity should be a positive integer
Rejected value: -1
```

## Equality in `invariantEqual`

`invariantEqual({ actual, expected, expectedBehavior, issueUrl?, equals? })`
compares with `Object.is` unless you pass `equals(actual, expected)`. So
`NaN` equals `NaN`, `0` does not equal `-0`, and objects and arrays are equal
only to themselves; pass `equals` to compare them by content or by a key.
`actual` and `expected` share one type, so comparing a number with a string is
a type error.

## Narrowing with `defined` and `satisfies`

`defined(value, { absent?, expectedBehavior, issueUrl? })` returns `value`
without what `absent` counts as absent:

| `absent`              | Rejects                | Returns                 |
| --------------------- | ---------------------- | ----------------------- |
| `"nullish"` (default) | `null` and `undefined` | `NonNullable<T>`        |
| `"undefined"`         | `undefined`            | `Exclude<T, undefined>` |
| `"null"`              | `null`                 | `Exclude<T, null>`      |

It tests only for `null` and `undefined`, never truthiness: `0`, `""`, `false`
and `NaN` are present. Use `invariant` to assert truthiness.

`satisfies(value, { predicate, expectedBehavior, issueUrl? })` returns `S`
when `predicate` is a type guard `(value: T) => value is S`, and `T`
otherwise. `T` is inferred from the value, so a guard over a wider type (say,
`unknown`) still narrows. The predicate is called as a method of the options.
To reuse a check, wrap the call in a function.

## Causes

Each cause is a plain object, typed and exported:

- `TodoCause` and `UnimplementedCause`: `{ description, subtasks,
  trackingUrl }`, with `undefined` for an absent description or URL and `[]`
  for an absent checklist. The checklist is a frozen copy, with each
  subtask's `complete` spelled out as `true` or `false`, so changing the
  caller's array afterwards does not change the cause.
- `UnreachableCause`: `{ value?, issueUrl }`; `value` is present exactly when
  one was passed.
- `InvariantCause`: `{ check, expectedBehavior, issueUrl }`, where `check`
  says which check failed and keeps the value(s) that failed it, discriminated
  by `check.kind`:
  - `{ kind: "condition", condition }`: the falsy condition `invariant` was
    given;
  - `{ kind: "defined", absent, value }`: the absent `null` or `undefined`
    `defined` was given, and what counted as absent;
  - `{ kind: "satisfies", value }`: the value `satisfies`'s predicate
    rejected;
  - `{ kind: "equal", actual?, expected? }`: the two values `invariantEqual`
    found unequal, each present exactly when it could be read.

Options never reach the panic's name: it is always the helper's own, even when
the options object carries extra fields at runtime.

```ts
import { isUnimplementedPanic, unimplemented } from "@sekhmet/workflow/todo";
import { assert, assertEquals, assertThrows } from "@std/assert";

const thrown = assertThrows(() =>
	unimplemented({ description: "sync over FTP" }),
);

assert(isUnimplementedPanic(thrown));
assertEquals(thrown.cause, {
	description: "sync over FTP",
	subtasks: [],
	trackingUrl: undefined,
});
```

## Exhaustiveness with `unreachable`

`unreachable` has two overloads: one without a value (`UnreachableOptions`)
and one whose `value` is required and typed `never`
(`UnreachableValueOptions`). So `unreachable({ value })` compiles only where
`value` has been narrowed to `never`. In the `default` of a `switch` over a
union, that means every member is handled; add a member and the call becomes
a compile error. Passing a value that is not narrowed is always a type error,
as is passing `undefined` or `any`, whether or not your project turns on
`exactOptionalPropertyTypes`.

## Rendering the impossible value

The impossible value arrived from somewhere the types did not cover, so it can
be anything. It is rendered with a small, runtime-agnostic formatter that
never throws:

- strings are quoted, `-0` and BigInts (`10n`) are kept apart, symbols read as
  `Symbol(tag)`, functions as `[Function: name]`, errors as
  `[TypeError: message]`;
- objects, arrays, typed arrays, maps and sets are shown two levels deep and
  ten entries wide, as `{ a: 1 }`, `[1, <empty>, 3]`,
  `Uint8Array(3) [0, 0, 0]`, `Map(1) { "a" => 1 }` and `Set(1) { 1 }`, with a
  class instance prefixed by its class name and cycles shown as `[Circular]`;
- properties are read through their descriptors, so no getter runs (shown as
  `[Getter]`) and no `toJSON` or `toString` is called;
- anything that still throws, such as a revoked Proxy, renders as
  `[unrenderable value]`.

Rendering is bounded, so a huge value cannot make a huge message or a slow
panic: strings and keys are cut at 200 characters (`"aaa…"… 4999800 more
chars`), lists are read by index and their hidden entries counted from their
length, and at most a hundred keys of an object are examined. A Proxy's own
`ownKeys` trap still runs once, at whatever cost it has.

Text you pass (descriptions, subtasks, the expected behavior) goes through
`String`, falling back to the same formatter if that throws, and is cut at a
thousand characters. A todo message lists at most fifty subtasks, then
`… N more subtasks`; the cause keeps them all.

## Never throwing while panicking

A helper runs when the program is already wrong, so it must throw its own
panic and nothing else. Every option is read through a guard: an untyped
caller's `null` options, a throwing getter, a hostile Proxy or a checklist
that is not an array cannot replace the panic with another error.

- a field that cannot be read renders as `[unrenderable value]`;
- a checklist that is not an array counts as empty;
- a URL that is not a `URL` is left out;
- an invariant check given no expected behavior says `(not given)`;
- `defined` given an `absent` it does not know counts `null` and `undefined`
  as absent;
- `satisfies` given a predicate that is not a function panics, as if the
  predicate rejected the value, and `invariantEqual` given an `equals` that
  is not a function panics, as if the values were unequal;
- `invariantEqual` fails closed: missing options, or an `actual` or
  `expected` that is missing or cannot be read, panic as unequal, with the
  value left out of the cause and shown as `[unrenderable value]`;
- if building the message still throws, the message is the header alone.

## Recognizing the panics

`isTodoPanic`, `isUnimplementedPanic`, `isUnreachablePanic` and
`isInvariantPanic` narrow an `unknown` to `Panic<…Cause>`. `isInvariantPanic`
accepts the panic of every invariant check (`invariant`, `invariantEqual`,
`defined` and `satisfies`); narrow further on `cause.check.kind`. They read a private
brand set when the helper throws, so:

- they run no Proxy trap, which keeps a hook that calls them from throwing;
- a `Panic` built by hand with the same name and cause is not accepted;
- each accepts only its own helper's panic: a todo panic is not an
  unimplemented one.

The brand belongs to the class in one copy of `@sekhmet/workflow`, so a guard
recognizes only panics thrown by that same copy, in the same realm. A panic
from a second copy of the package (two versions in one dependency tree, say)
or from another realm (an iframe, a worker, a `vm` context) fails every
guard. Such a panic is still a `Panic` named `Panic (Todo)` and so on; to
handle it, deduplicate the package, or fall back to its `name`.

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { isInvariantPanic, invariant } from "@sekhmet/workflow/invariant";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { assert, assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
runtime.setHook(() => {}); // keep the example quiet

const result = runtime.catchUnwind(() => {
	invariant(false, { expectedBehavior: "false should be true" });
});

assert(isErr(result));
const payload = unwrapErr(result);
assert(isInvariantPanic(payload));
assertEquals(payload.cause.expectedBehavior, "false should be true");
```

## Keeping `todo` out of releases

The publish-readiness step of `deno task ci` fails when a package's non-test
source (its `src/` and its top-level modules alike) reaches `todo` from
`@sekhmet/workflow`. It flags the import itself, not call sites, so every call
shape is caught:

- a value import binding `todo`, under any alias or quoted name;
- a re-export of `todo`, or an `export *` of a module holding it;
- `ns.todo`, `ns?.todo` or `ns["todo"]` through a namespace import;
- a dynamic `import()` of a module holding `todo`.

It recognizes the package by every specifier form: bare, `jsr:` (with a
version), `npm:@jsr/sekhmet__workflow`, `https://jsr.io/@sekhmet/workflow/…`
URLs, and relative paths into `packages/workflow`. Tests, the playground and
`scripts/` may use `todo` freely. `unimplemented`, `unreachable` and the
invariant checks are meant to ship and are never flagged.

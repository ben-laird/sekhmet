# Workflow helpers guide

This guide covers the helpers in `@sekhmet/workflow`: when to use each, the
exact messages they panic with, their causes, and how to recognize them.

All four panic through [`@sekhmet/panic`](https://jsr.io/@sekhmet/panic). A panic means
the program is wrong, never that input was bad: return a `Result` for an
expected failure. Run your program inside a panic runtime
(`definePanicRuntime()`) and its hook reports these panics like any other.

## Choosing a helper

| The code…                                  | Use             |
| ------------------------------------------ | --------------- |
| is not written yet, but will be            | `todo`          |
| is deliberately not supported              | `unimplemented` |
| cannot run unless the types lie            | `unreachable`   |
| relies on a condition only a bug can break | `invariant`     |

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

## Causes

Each cause is a plain object, typed and exported:

- `TodoCause` and `UnimplementedCause`: `{ description, subtasks,
  trackingUrl }`, with `undefined` for an absent description or URL and `[]`
  for an absent checklist.
- `UnreachableCause`: `{ value?, issueUrl }`; `value` is present exactly when
  one was passed.
- `InvariantCause`: `{ condition, expectedBehavior, issueUrl }`, where
  `condition` is the falsy value that broke the invariant.

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

`UnreachableOptions.value` has type `never`, so `unreachable({ value })`
compiles only where `value` has been narrowed to `never`. In the `default` of
a `switch` over a union, that means every member is handled; add a member and
the call becomes a compile error. Passing a value that is not narrowed is
always a type error, as is passing `undefined`.

## Rendering the impossible value

The impossible value arrived from somewhere the types did not cover, so it can
be anything. It is rendered with a small, runtime-agnostic formatter that
never throws:

- strings are quoted, `-0` and BigInts (`10n`) are kept apart, symbols read as
  `Symbol(tag)`, functions as `[Function: name]`;
- objects and arrays are shown two levels deep and ten entries wide, with a
  class instance prefixed by its class name, and cycles shown as `[Circular]`;
- properties are read through their descriptors, so no getter runs (shown as
  `[Getter]`) and no `toJSON` or `toString` is called;
- anything that still throws, such as a revoked Proxy, renders as
  `[unrenderable value]`.

Text you pass (descriptions, URLs, the expected behavior) goes through
`String`, falling back to the same formatter if that throws. Building a
message never throws while panicking.

## Recognizing the panics

`isTodoPanic`, `isUnimplementedPanic`, `isUnreachablePanic` and
`isInvariantPanic` narrow an `unknown` to `Panic<…Cause>`. They read a private
brand set when the helper throws, so:

- they run no Proxy trap, which keeps a hook that calls them from throwing;
- a `Panic` built by hand with the same name and cause is not accepted;
- each accepts only its own helper's panic: a todo panic is not an
  unimplemented one.

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

The publish-readiness step of `deno task ci` fails on a call to `todo`
imported from `@sekhmet/workflow` (any subpath, under any alias, or through a
namespace import) in non-test source under `packages/*/src`. Tests, the
playground and `scripts/` may call it freely. `unimplemented`, `unreachable`
and `invariant` are meant to ship and are never flagged.

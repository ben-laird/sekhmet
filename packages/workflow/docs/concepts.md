---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/workflow`, and why it is built the way it is. The
[recipes](./recipes.md) show how to put the helpers to work.

## A panic means a bug

Every helper panics, and a panic means the program is wrong, never that its
input was bad. A missing feature, a case the types ruled out, a broken
assumption: each is a fact about the code, and no caller can handle it by
retrying or by showing the user an error. An expected failure, such as input
that does not parse, belongs in a `Result`, where the signature says it can
happen and the compiler makes the caller deal with it.

The helpers are named for what the code says about itself. `todo` says the
code is not written yet, `unimplemented` that it never will be, `unreachable`
that the types prove it cannot run, and the invariant checks that only a bug
can break what follows. Reading the call tells you which, without reading the
message.

## Built on `@sekhmet/panic`

The helpers do not report or recover from anything themselves. Each throws a
`Panic` from [`@sekhmet/panic`](https://jsr.io/@sekhmet/panic), with its own
name (`Panic (Todo)`, `Panic (Invariant)` and so on) and a typed cause, and
leaves the rest to a panic runtime: a program runs inside
`definePanicRuntime()`, whose hook reports every panic and whose
`catchUnwind` boundaries stop them. So these panics are reported the same way
as any other, by one hook the program chooses, and the package adds no global
state of its own.

What the package adds is the cause and the guard. The cause keeps what the
call was given, as data, so a hook can file the tracking URL, count the
broken invariants, or show the impossible value without parsing a message.
The guard tells a hook which helper threw.

## Recognizing a panic by its brand

The guards (`isTodoPanic` and the rest) do not compare names. The panic
class keeps a private brand, set when a helper throws, and the guard reads
it. That has three consequences:

- a guard runs no Proxy trap, so a hook that calls one cannot throw from it;
- a `Panic` built by hand with the same name and cause is not accepted, so
  nothing else can pass for a helper's panic;
- each guard accepts only its own helper's panic.

The brand belongs to the class in one copy of `@sekhmet/workflow`, so a guard
recognizes only panics thrown by that same copy, in the same realm. A panic
from a second copy of the package (two versions in one dependency tree, say)
or from another realm (an iframe, a worker, a `vm` context) fails every
guard. Such a panic is still a `Panic` named `Panic (Todo)` and so on; to
handle it, deduplicate the package, or fall back to its `name`.

## Equality in `invariantEqual`

`invariantEqual` compares with `Object.is` unless you pass `equals`. That is
JavaScript's own notion of "the same value". Unlike `===`, it treats `NaN` as
equal to itself, so asserting that a computation gave `NaN` can pass, and it
keeps `0` and `-0` apart, which matters when the sign carries meaning.

Objects compare by identity. There is no single right notion of content
equality (deep or shallow, ordered or not, by every field or by a key), so
the package does not pick one: `equals` lets the call say what equal means
there. Both values share one inferred type, so comparing a number to a string
is a type error rather than a guaranteed panic, while a nullable value still
compiles against `null`.

## Rendering the impossible value

`unreachable` shows the value that should have been impossible, and the
invariant checks show the values that failed them. That value arrived from
somewhere the types did not cover, so it can be anything. It is rendered with
a small, runtime-agnostic formatter that never throws:

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
thousand characters.

## Never throwing while panicking

A helper runs when the program is already wrong, so it must throw its own
panic and nothing else; an unrelated error would hide the bug it reports.
Every option is read through a guard: an untyped caller's `null` options, a
throwing getter, a hostile Proxy or a checklist that is not an array cannot
replace the panic with another error.

- a field that cannot be read renders as `[unrenderable value]`;
- a checklist that is not an array counts as empty;
- a URL that is not a `URL` is left out;
- an invariant check given no expected behavior says `(not given)`;
- `defined` given an `absent` it does not know counts `null` and `undefined`
  as absent;
- `satisfies` given a predicate that is not a function panics, as if the
  predicate rejected the value, and `invariantEqual` given an `equals` that
  is not a function panics, as if the values were unequal;
- a `predicate` or `equals` that throws is not caught: it runs before any
  panic, so its error propagates unchanged, as from `Array.prototype.filter`;
- `invariantEqual` fails closed: missing options, or an `actual` or
  `expected` that is missing or cannot be read, panic as unequal, with the
  value left out of the cause and shown as `[unrenderable value]`;
- if building the message still throws, the message is the header alone.

Failing closed is the safe direction for an invariant: a check that cannot
tell whether the program is right reports it as wrong, rather than letting a
possible bug through.

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
`definePanicRuntime()`, whose `catchUnwind` boundaries stop the panics that
reach them and report each one to the runtime's hook. The hook runs at the
boundary, not at the throw, so a panic caught by a plain `try`/`catch` before
it reaches a boundary is never reported. These panics are reported the same
way as any other, by one hook the program chooses, and the package adds no
global state of its own.

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

`invariantEqual` compares with `Object.is` by default: `NaN` equals `NaN`,
and `-0` differs from `+0`. Objects compare by identity, so for structural or
domain equality the call passes an `equals` comparator.

Both values share one inferred type `T`, as in `@std/assert`'s
`assertEquals`. So comparing a number to a string is a type error, while
`actual: 1, expected: null` compiles, with `T` inferred as `number | null`.
The alternative, `assertStrictEquals`'s `actual: unknown`, buys nothing here:
an `asserts` signature cannot narrow a property of an options object, so an
`unknown` `actual` would only loosen the type check.

## Rendering the impossible value

`unreachable` shows the value that should have been impossible, and the
invariant checks show the values that failed them. That value arrived from
somewhere the types did not cover, so it can be anything: a cycle, a BigInt,
a throwing getter, a hostile Proxy. Rendering it must not throw, must not run
the value's own code, and must not turn a bug report into a huge message, so
the helpers use their own small, runtime-agnostic formatter. It reads properties through their
descriptors instead of running getters, `toJSON` or `toString`, and cuts
strings, depth and width short. The module docs in the
[API reference](https://jsr.io/@sekhmet/workflow/doc) list the exact formats
and limits.

The bounds keep the message small, and most of the work with it, but not all
of it. An object's own key names are listed in full before the formatter
picks the few it shows, so rendering a very large object still takes time
linear in its key count, and a Proxy's `ownKeys` trap runs once, at whatever
cost it has.

## Never throwing while panicking

A helper runs when the program is already wrong, so it must throw its own
panic and nothing else; an unrelated error would hide the bug it reports.
Every option is read through a guard, so an untyped caller's `null` options,
a throwing getter, a hostile Proxy or a checklist that is not an array
cannot replace the panic with another error. Each bad option has a fixed
fallback, listed in the module docs in the
[API reference](https://jsr.io/@sekhmet/workflow/doc).

The one thing a helper does not guard is the caller's own code. A
`predicate` or `equals` that throws runs before any panic, so its error
propagates unchanged, as from `Array.prototype.filter`.

`invariantEqual` fails closed: when it cannot tell whether the values are
equal, it panics. A check that cannot tell whether the program is right
reports it as wrong, rather than letting a possible bug through.

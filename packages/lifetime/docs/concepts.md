---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/lifetime`, and why a lifetime behaves the way it
does. The [recipes](./recipes.md) show how to put them to work, and the
[API reference on JSR](https://jsr.io/@sekhmet/lifetime/doc) documents each
export.

## RAII, split in two

RAII ("resource acquisition is initialization") ties a resource to a value:
acquiring the resource makes the value, and the value's end releases it, so
a resource can't outlive its owner or be released twice. C++ and Rust get
the end from the language: a destructor, or `Drop`, runs when the value
leaves scope. JavaScript has no destructors, so the package makes both
edges explicit, and gives each its own type:

- **A `Resource` is the rising edge.** It pairs `init`, which acquires a
  value from an input, with `deinit`, which releases it. One resource is a
  recipe; each `start` acquires one value. `start` returns a `Vow` (settled
  at once when `init` is synchronous), since acquisition may or may not be
  async, and the rule is that anything that may be either returns a `Vow`.
- **A `Lifetime` is the falling edge.** It owns the acquired value and
  guarantees its release. It exists only once its value does, so it is
  born `Alive(value)`; `end(cause)` moves it to `Ending(cause)` while its
  teardown runs, then to `Ended(report)`. There is no "not yet started"
  phase, and no lifetime without a value.

The split keeps each half honest. A failure to acquire is the resource's
concern: `start` returns `Err` with the panic, and no lifetime is made, so
there is nothing half-built to end. A lifetime's concern is only the
release, which it guarantees whatever happens to the value in between.

The guarantee comes from someone calling `end`, not from garbage
collection. `using` and `await using` are the convenient way to make that
call when a block exits; a framework can call it from its own `finally`.

## Phases come from signals

A lifetime's two transitions are `DispatchSignal`s from
`@sekhmet/dispatch`: `ending` dispatches the cause when the lifetime starts
ending, and `ended` dispatches the report when its teardown finishes. Its
phase is read from them, never kept by hand: `Ended` if `ended` has
dispatched, `Ending` if `ending` has, `Alive` otherwise. So the phase can't
drift from what listeners heard, and a listener added late still hears the
transition, since a dispatch listener added afterwards runs at once.

Listeners are notifications: synchronous, and not awaited. Work that has to
finish before the lifetime has ended (closing a connection) is a cleanup,
registered with `defer`, which may be async and is awaited.

Use after end can't be prevented in TypeScript, which has no affine types,
but it can be made explicit. `value()` returns `Some(value)` only while
Alive, and `with(fn)` runs `fn` only while Alive, so the value stays inside
the callback rather than escaping into a variable that outlives it.

## One stack, in reverse acquisition order

Teardown is one stack. Every cleanup registered with `defer` and every
child adopted with `adopt` (or made with `child`) is pushed on it, in the
order they were acquired, and `end` pops them: whatever was acquired last
is released first. A child on the stack ends with the parent's cause (mapped
into its own, if it has its own cause type) and is awaited like any async
cleanup.

Many libraries release children first, then the owner's own cleanups. One
stack is the RAII rule instead: if a cleanup was registered before a child
was acquired, the child may depend on what that cleanup releases, so the
child must go first; if the cleanup came after, it may use the child, so it
must go first. Only acquisition order gets both cases right.

Ending is one-way, idempotent and memoised: the first `end(cause)` wins,
and every later call returns the same `ended` signal. While the stack
drains, a new `defer` joins it (`DuringEnd`) and runs in the same pass. After
the lifetime has ended, a `defer` runs at once with the cause it ended with
(`AfterEnd`), so a cleanup is never silently dropped, as an `abort` listener
added after the abort is.

## A failed cleanup is a panic in the report

A cleanup shouldn't throw; one that does has a bug, or hit a failure it
couldn't handle. Each runs inside the panic runtime's boundary
(`catchUnwind`, or `catchUnwindAsync` for a promise), so its throw or
rejection is reported to the runtime's hook and becomes a `Panic` in the
`EndReport`, and the teardown carries on. Every cleanup runs, and every
failure is kept, in the order the cleanups ran: `Ok(cause)` when all of
them succeeded, or `Err({ cause, panics })` otherwise. A child's failures
are part of its parent's report.

Only the `using` boundary turns a report into a throw: one panic as it is,
several chained as `SuppressedError`s, the latest outermost, as the
explicit resource management spec chains disposal errors. Where the
platform has no `SuppressedError` yet, an `Error` of the same shape stands
in; the package never installs a global.

## Double faults

A panic hook that throws while reporting is a double fault: the boundary
can't report its own failure, so `catchUnwind` throws a `Panic (PanicHook)`
instead of returning. `@sekhmet/dispatch`'s rule for that is to finish the
work, then rethrow. A lifetime follows it where it can:

- **In the synchronous part of `end`**, the teardown still drains as far as
  it can synchronously, `ended` dispatches if the stack emptied, and then
  `end` rethrows the first double fault. Its panic is in the report too,
  except one from an `ended` listener, which comes after the report is out.
  A child whose synchronous teardown double faults passes it on to its
  parent's `end`.
- **In an async continuation** (after an async cleanup was awaited),
  nothing is thrown: a throw in a promise continuation would be an
  unhandled rejection, which no caller could catch. The double fault is a
  panic in the report instead. One from an `ended` listener there has
  nowhere to go and is lost.

A `Resource` follows the same rule for `init`: a double fault in a
synchronous `init` tears `setup` down, then `start` rethrows it; in an async
`init`, it is the `Err`'s panic.

## SetupEnd: what init acquired

`init` receives `setup`, a lifetime of its own, for what it acquires along
the way: a cleanup it defers, or another resource it adopts. `setup` is
adopted into the new lifetime before `deinit` is deferred, so it sits
beneath `deinit` on the stack, and what `init` acquired outlives `deinit`. A
repository's `deinit` can still flush through the connection its `init`
opened.

`setup`'s cause is a `SetupEnd<C>`, because it ends in one of two ways:

- `Ended(cause)`: the resource's lifetime ended normally, with `cause`,
  and `deinit` has run.
- `InitPanicked(panic)`: `init` panicked before the resource existed. There
  is no lifetime and no `deinit`; `setup` is torn down at once, and `start`
  settles with `Err(panic)` once it has been, so nothing `init` acquired
  leaks. If setup's teardown fails too, the `Err` carries everything in one
  place: a `Panic (SetupTeardownFailed)` whose cause holds `init`'s panic
  and each of setup's cleanup panics (`isSetupTeardownPanic` narrows it).
  This keeps failures as data, as an `EndReport` does, rather than a
  `SuppressedError` chain, which only the `using` boundary builds. Each
  panic was reported to the hook once, when it happened; the one that
  carries them is not reported again.

A cleanup on `setup` reads the variant to know which happened, and a child
adopted on it maps the variant into its own cause with `fromParent`.

## Adoption

Trees are built by hand. `new Lifetime(...)` is a root; `parent.adopt({
child })` makes it a child, and `parent.child({ value })` is the two in one.
Explicit owners avoid the bug class of implicit ones (an owner tracked in
a global, lost after an `await`), at the cost of passing the parent along.

`adopt` returns an `Adoption`, and only `Adopted` puts the child on the
parent's stack. The rules:

- **One owner.** A child that already has an owner is `AlreadyOwned`.
- **No cycles.** A child that is the parent itself, or one of its owners at
  any depth, is `WouldCycle`.
- **Only live children.** A child that has started ending is
  `ChildEnded`: there is nothing left to own.
- **Born dead.** A parent that is ending or has ended can't own anything
  new, but mustn't leak it either: the child is ended at once, with the
  parent's cause, and the result is `ParentEnded`.

A child that ends on its own leaves its owner: its entry comes off the
parent's stack, so the parent's later end doesn't reach it, and it keeps
its own cause.

## Causes per child

A child may have its own cause type `D`: a request's
`"client gone" | "served"` inside an app's `"shutdown" | "crashed"`.
`fromParent: (cause: C) => D` maps the parent's cause into the child's. It
runs when the parent's teardown reaches the child, and not before, so a
child that ends first never calls it. It also maps the parent's dispose
cause for `using`, for a child without one of its own, looked up when the
child is disposed, so it reaches through owners adopted later.

A `fromParent` that throws is a panic in the parent's report. The child
then has no cause to end with, so the parent releases it instead of
leaking a link to an owner that has ended: the child stays Alive as a root
again, which another lifetime can adopt and whoever holds it can end.

## Why Lifetime is invariant in C

`Lifetime<T, C>` is invariant in its cause. `end` takes a `C`, so a
`Lifetime<T, "done">` can't be used as a `Lifetime<T, string>`: the wider
type would let anyone end it with a cause its cleanups don't expect. And
`ending` dispatches a `C`, so a `Lifetime<T, string>` can't be used as a
`Lifetime<T, "done">` either: its readers would get causes they don't
handle. A child that needs a different cause type gets one through
`fromParent`, which converts at the edge instead.

## No module state

A lifetime takes its panic runtime (`catchUnwind` and `catchUnwindAsync`)
as a parameter, and the package keeps no global or module-level state:
there is no current owner, no registry and no default runtime. Two
lifetimes interact only when one adopts the other.

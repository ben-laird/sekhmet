---
kind: explanation
---

# Concepts

The ideas behind `@sekhmet/dispatch`, and why a dispatch behaves the way it
does. The [recipes](./recipes.md) show how to put them to work, and the
[API reference on JSR](https://jsr.io/@sekhmet/dispatch/doc) documents each
export.

## Why not an AbortSignal

`AbortController` and `AbortSignal` are the platform's one-shot signal, and
most of their shape is right: a write side you keep, a read side you hand
out, and an event that happens once. Three things make them awkward as a
general signal:

- **The reason is `any`.** Every reader has to guess what an abort carries.
  A `DispatchSignal<T>` carries a `T`, so a lifetime's end can be a
  discriminated union the compiler checks.
- **A late listener never fires.** An `abort` listener added after the abort
  is silently ignored, so code has to check `aborted` first and race the
  check. A dispatch listener added afterwards runs at once.
- **A throwing listener escapes.** An exception in an `abort` listener is
  reported as an uncaught error by the event loop. A dispatch runs each
  listener inside a panic boundary you choose.

The package keeps the platform's class shape (`new DispatchController()`,
`controller.signal`, statics such as `DispatchSignal.any`) so it reads like
the API it replaces, and converts both ways at the edges with
`toAbortSignal` and `DispatchSignal.fromAbortSignal`.

## Two capabilities

A `DispatchController<T>` can dispatch; its `DispatchSignal<T>` can only be
listened to, polled and converted. Holding the controller is the right to end
something; holding the signal is the right to hear about it. Hand out the
signal and keep the controller.

To keep that split honest, a `DispatchSignal` has no public constructor, as
`AbortSignal` has none: calling `new DispatchSignal()` from outside the
package is a type error, and throws a `TypeError` if the types are bypassed.
Signals come from a controller, a combinator or a static.

A `DispatchSignal` is covariant in `T`: a signal of `"done" | "cancelled"` is
a signal of `string`, since a reader of the wider type is happy with any
narrower value.

## The first dispatch wins

A dispatch happens once. Later calls change nothing, and say so:
`dispatch(value)` returns the value already there, like Rust's
`HashMap::insert` returns the previous entry. `None` means this call
dispatched; `Some(first)` means an earlier call had, and carries its value.
Losing the race isn't an error, so two parties racing to end something both
get a clear answer without a `try`.

That return is an `Option` rather than a `Poll` on purpose: it answers "was
something already there?", not "is it ready yet?". Only `signal.poll()`
returns a `Poll`: `Ready(value)` once dispatched, `Pending` before.

## Listeners never miss it

`whenDispatched(listener)` runs the listener when the signal dispatches, or
at once if it already has. Every listener returns an `Unsubscribe`, which
removes it if it hasn't run and reports whether it did.

Listeners run in the order they were added. A listener added while the
dispatch is running (by another listener, say) joins the end of the queue and
runs in the same dispatch, after the ones already waiting. A listener that
dispatches again gets the first value back, as any later call does.

## A throwing listener is a panic

A listener shouldn't throw: one that does has a bug. The controller takes the
`catchUnwind` of a `@sekhmet/panic` runtime and runs each listener inside it,
so a throw is isolated and reported to that runtime's hook. The other
listeners still run, the signal is still dispatched, and `dispatch` returns
normally.

A hook that throws while reporting is a double fault, which `catchUnwind`
turns into a panic of its own. That one does propagate, since the runtime can
no longer report it. Even then the dispatch completes first: every queued
listener runs in order, the queue drains, and later listeners still run at
once. Then `dispatch` rethrows the first such panic.

The controller takes only `catchUnwind`, not the whole runtime, because that
is all it needs: `new DispatchController<T>(runtime.catchUnwind)`. Derived
signals need no runtime of their own, since each of their listeners runs
inside a root controller's boundary.

## Derived signals hold no subscription

`map`, `zip`, `DispatchSignal.any` and `DispatchSignal.fromAbortSignal`
build signals that hold no listeners of their own. A derived signal forwards
each listener to its sources, and reads them when polled. So a derived
signal nobody listens to holds no subscription on its sources, and a
long-lived source doesn't accumulate listeners for signals that were derived
and dropped.

Two consequences follow:

- `map` remembers its mapped value, so `mapping` runs once however many
  listeners and polls read it.
- `any` sees the race only through its listeners. With a listener, the first
  source to dispatch wins. With none, it can't know which source came first,
  so among sources already dispatched when it is first read, the earliest in
  the array wins.

The conversions are different: `wait`, `toVow` and `toAbortSignal` subscribe
until the dispatch, since the promise, vow or platform signal they return has
to hear it. Each call to `toVow` makes a new `Vow`, which resolves inside the
dispatch with no microtask in between.

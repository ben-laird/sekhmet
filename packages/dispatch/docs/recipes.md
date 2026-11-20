---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when you signal with a dispatch. For
every export, see the [API reference](https://jsr.io/@sekhmet/dispatch/doc);
for why a dispatch behaves as it does, see the [concepts](./concepts.md).

## How to cancel fetch with a typed reason

1. Make a `DispatchController` for the reason's type.
2. Pass `controller.signal.toAbortSignal()` to `fetch` (or any platform API
   that takes an `AbortSignal`).
3. Dispatch the reason; the platform signal aborts with it as its `reason`.

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

type Reason = { readonly kind: "user" } | { readonly kind: "navigated" };

const cancel = new DispatchController<Reason>(definePanicRuntime().catchUnwind);
const signal = cancel.signal.toAbortSignal();
// await fetch(url, { signal });

cancel.dispatch({ kind: "navigated" });
assertEquals(signal.reason, { kind: "navigated" });
```

The platform signal subscribes until the dispatch, so make one per request
rather than per call to a long-lived signal that may never dispatch.

## How to race signals

Use `DispatchSignal.any`. It dispatches with the first source to dispatch and
lets go of the others:

```ts
import { DispatchController, DispatchSignal } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const { catchUnwind } = definePanicRuntime();
const shutdown = new DispatchController<string>(catchUnwind);
const request = new DispatchController<string>(catchUnwind);
const stop = DispatchSignal.any([shutdown.signal, request.signal]);

const heard: string[] = [];
stop.whenDispatched((reason) => {
	heard.push(reason);
});

request.dispatch("client went away");
shutdown.dispatch("shutting down");
assertEquals(heard, ["client went away"]);
```

`any` sees the race through its listeners. If nobody listens and both
sources dispatch before you poll it, the earliest in the array wins.
`DispatchSignal.any([])` never dispatches.

## How to wait for two signals

Use `zip`, which dispatches both values as a pair once both have dispatched,
and `map` to shape the pair:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const { catchUnwind } = definePanicRuntime();
const host = new DispatchController<string>(catchUnwind);
const port = new DispatchController<number>(catchUnwind);
const url = host.signal.zip(port.signal).map(([h, p]) => `http://${h}:${p}`);

port.dispatch(8080);
host.dispatch("localhost");
assertEquals(url.poll(), Ready("http://localhost:8080"));
```

## How to adapt an AbortSignal

Use `DispatchSignal.fromAbortSignal` to read a platform signal, such as one a
framework hands you, as a dispatch of its abort reason:

```ts
import { DispatchSignal } from "@sekhmet/dispatch";
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const platform = new AbortController();
const closed = DispatchSignal.fromAbortSignal({
	signal: platform.signal,
	catchUnwind: definePanicRuntime().catchUnwind,
});

platform.abort("socket closed");
assertEquals(closed.poll(), Ready("socket closed"));
```

Its value is `unknown`, as a platform reason is; narrow it, or `map` it to
your own type. It adds a platform listener only while it has listeners.

## How to await a signal

Use `wait()` for a `Promise`, or `toVow()` for a `Vow` that resolves inside
the dispatch, with no microtask in between:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { isResolved } from "@sekhmet/vow/mini";
import { assert, assertEquals } from "@std/assert";

const ready = new DispatchController<string>(definePanicRuntime().catchUnwind);
const promise = ready.signal.wait();
const vow = ready.signal.toVow();

ready.dispatch("listening");
assert(isResolved(vow));
assertEquals(await promise, "listening");
```

Both subscribe until the dispatch: awaiting a signal that never dispatches
keeps its listener.

## How to hand out a signal that has already finished

When a function takes a `DispatchSignal` and you already know the value (or
know it will never come), use the statics instead of a controller:

```ts
import { DispatchSignal } from "@sekhmet/dispatch";
import { isPending, Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";

const done = DispatchSignal.dispatched({
	value: "done",
	catchUnwind: definePanicRuntime().catchUnwind,
});
const forever = DispatchSignal.never<string>();

assertEquals(done.poll(), Ready("done"));
assert(isPending(forever.poll()));
```

## How to catch a throwing listener

A listener that throws is a panic: `catchUnwind` isolates it and reports it
to the runtime's hook, and the other listeners still run. Set a hook to see
it:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const reported: unknown[] = [];
runtime.setHook(({ payload }) => {
	reported.push(payload);
});

const end = new DispatchController<string>(runtime.catchUnwind);
const heard: string[] = [];
end.signal.whenDispatched(() => {
	throw new Error("listener bug");
});
end.signal.whenDispatched((value) => {
	heard.push(value);
});

end.dispatch("done"); // never throws
assertEquals(heard, ["done"]);
assertEquals(reported.length, 1);
```

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

const cancel = new DispatchController<Reason>({ panics: definePanicRuntime() });
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

const panics = definePanicRuntime();
const shutdown = new DispatchController<string>({ panics });
const request = new DispatchController<string>({ panics });
const stop = DispatchSignal.any([shutdown.signal, request.signal]);

const heard: string[] = [];
stop.whenDispatched((reason) => {
	heard.push(reason);
});

request.dispatch("client went away");
shutdown.dispatch("shutting down");
assertEquals(heard, ["client went away"]);
```

`any` decides the first time it sees a dispatch, and picks the earliest
source in the array that is Ready at that moment. So when the order matters
for sources that can be Ready together, put the one that should win first.
`DispatchSignal.any([])` never dispatches.

## How to wait for two signals

Use `zip`, which dispatches both values as a pair once both have dispatched,
and `map` to shape the pair:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const panics = definePanicRuntime();
const host = new DispatchController<string>({ panics });
const port = new DispatchController<number>({ panics });
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
	panics: definePanicRuntime(),
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

const ready = new DispatchController<string>({ panics: definePanicRuntime() });
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
import { assert, assertEquals } from "@std/assert";

const done = DispatchSignal.dispatched({ value: "done" });
const forever = DispatchSignal.never<string>();

assertEquals(done.poll(), Ready("done"));
assert(isPending(forever.poll()));
```

## How to catch a throwing listener

A listener that throws is a panic: the boundary isolates it and reports it
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

const end = new DispatchController<string>({ panics: runtime });
const heard: string[] = [];
end.signal.whenDispatched(() => {
	throw new Error("listener bug");
});
end.signal.whenDispatched((value) => {
	heard.push(value);
});

end.dispatch("done"); // the listener's throw never reaches us
assertEquals(heard, ["done"]);
assertEquals(reported.length, 1);
```

The one throw that does reach `dispatch` is a double fault: a hook that
throws while reporting. The dispatch still completes (every listener runs, and
later listeners still run at once), then `dispatch` rethrows the panic the
boundary raised.

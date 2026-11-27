---
kind: tutorial
---

# Getting started

In this tutorial we will build the end signal of a cancellable download. We
will start with a controller for a typed end cause, listen to it, see that
the first dispatch wins, race a timeout against the user, and finish by
handing the signal to `fetch`. Each step is a complete program you can run.

## Install

Add the package, `@sekhmet/panic`, whose runtime isolates throwing
listeners, `@sekhmet/enum`, whose `Option` and `Poll` the signal returns, and
`@std/assert`, which each step uses to check its output:

```sh
deno add jsr:@sekhmet/dispatch jsr:@sekhmet/panic jsr:@sekhmet/enum jsr:@std/assert
```

## Make an end signal

First, we describe how a download can end, and make a controller for it. The
controller takes the panic runtime as `panics`, the boundary its listeners
will run in:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { isPending, Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";

type EndCause =
	| { readonly kind: "finished" }
	| { readonly kind: "cancelled"; readonly by: "user" | "timeout" };
// {}

const runtime = definePanicRuntime();
const end = new DispatchController<EndCause>({ panics: runtime });

assert(isPending(end.signal.poll()));

end.dispatch({ kind: "finished" });
assertEquals(end.signal.poll(), Ready({ kind: "finished" }));
```

`end.signal` is `Pending` until the controller dispatches, then `Ready` with
the cause. Its type is `EndCause`, not `any`: the compiler knows what every
reader gets.

## Listen for the end

Next, we hand the signal to the code that needs to know when the download
ends, and keep the controller to ourselves:

```ts
import { DispatchController, type DispatchSignal } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

type EndCause =
	| { readonly kind: "finished" }
	| { readonly kind: "cancelled"; readonly by: "user" | "timeout" };
// {}

function progressBar(ended: DispatchSignal<EndCause>, log: string[]): void {
	ended.whenDispatched((cause) => {
		log.push(`progress bar hidden (${cause.kind})`);
	});
}

const runtime = definePanicRuntime();
const end = new DispatchController<EndCause>({ panics: runtime });
const log: string[] = [];
progressBar(end.signal, log);

end.dispatch({ kind: "cancelled", by: "user" });
assertEquals(log, ["progress bar hidden (cancelled)"]);
```

`progressBar` gets a `DispatchSignal`, which has no `dispatch`: it can react
to the end, but it can't end the download.

## The first dispatch wins

A download can be cancelled and finish at almost the same moment. Only the
first dispatch counts, and each call tells us what happened:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { isNone, Some } from "@sekhmet/enum/option/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";

type EndCause =
	| { readonly kind: "finished" }
	| { readonly kind: "cancelled"; readonly by: "user" | "timeout" };
// {}

const runtime = definePanicRuntime();
const end = new DispatchController<EndCause>({ panics: runtime });

const first = end.dispatch({ kind: "cancelled", by: "user" });
const second = end.dispatch({ kind: "finished" });

assert(isNone(first));
assertEquals(second, Some({ kind: "cancelled", by: "user" }));

const log: string[] = [];
end.signal.whenDispatched((cause) => {
	log.push(`late listener heard ${cause.kind}`);
});
assertEquals(log, ["late listener heard cancelled"]);
```

`dispatch` returns the value already there: `None` means this call
dispatched, and `Some` carries the value that beat it. The listener we added
afterwards still ran, at once, which an `AbortSignal` listener added after
the abort never does.

## Race a timeout against the user

Now the download ends when the user cancels or a timeout fires, whichever
comes first. Each gets its own controller, and `DispatchSignal.any` races
their signals:

```ts
import { DispatchController, DispatchSignal } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const user = new DispatchController<"user">({ panics: runtime });
const timeout = new DispatchController<"timeout">({ panics: runtime });
const cancelled = DispatchSignal.any([user.signal, timeout.signal]).map(
	(by) => ({ kind: "cancelled", by }) as const,
);

const log: string[] = [];
cancelled.whenDispatched((cause) => {
	log.push(`cancelled by ${cause.by}`);
});

timeout.dispatch("timeout");
user.dispatch("user");
assertEquals(log, ["cancelled by timeout"]);
```

`map` turns the winner into an end cause. Neither derived signal holds a
listener of its own: each listener we add is forwarded to the sources.

## Hand it to fetch

Last, `fetch` takes an `AbortSignal`, so we convert ours. The platform signal
aborts with our typed cause as its reason:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { definePanicRuntime } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";

type EndCause =
	| { readonly kind: "finished" }
	| { readonly kind: "cancelled"; readonly by: "user" | "timeout" };
// {}

const runtime = definePanicRuntime();
const end = new DispatchController<EndCause>({ panics: runtime });
const forFetch: AbortSignal = end.signal.toAbortSignal();
// fetch(url, { signal: forFetch })

end.dispatch({ kind: "cancelled", by: "user" });
assert(forFetch.aborted);
assertEquals(forFetch.reason, { kind: "cancelled", by: "user" });
```

## What we built

We made a typed end signal and handed out its read side, saw that the first
dispatch wins and that late listeners still hear it, raced two causes with
`any` and `map`, and bridged the result to `fetch`. The
[recipes](./recipes.md) cover more tasks, and the [concepts](./concepts.md)
explain why a dispatch behaves this way.

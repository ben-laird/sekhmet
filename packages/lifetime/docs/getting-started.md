---
kind: tutorial
---

# Getting started

In this tutorial we will give a small web app a lifetime: one root that owns
a log file, a database connection and the requests in flight, and that
releases all of them, in the right order, when the app shuts down. We will
start with a single cleanup, grow a tree of children, acquire the database
through a `Resource`, tear it all down with `await using`, and finish by
ending a request from outside. Each step is a complete program you can run.

## Install

Add the package, `@sekhmet/panic`, whose runtime isolates failing cleanups,
`@sekhmet/enum`, whose `Option` and `Result` the lifetime returns,
`@sekhmet/dispatch`, whose signals it is built on, `@sekhmet/vow`, which a
resource's `start` returns, and `@std/assert`, which each step uses to check
its output:

```sh
deno add jsr:@sekhmet/lifetime jsr:@sekhmet/panic jsr:@sekhmet/enum jsr:@sekhmet/dispatch jsr:@sekhmet/vow jsr:@std/assert
```

## Make a lifetime

First, we describe how the app can end, and make a root lifetime for it. A
lifetime holds a value from birth; the app's root holds nothing yet, so its
value is `undefined`. It takes a panic runtime, the boundary its cleanups
will run in:

```ts
import { isolate } from "@sekhmet/enum/core/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assert, assertEquals } from "@std/assert";

type AppCause = "shutdown" | "crashed";

const app = new Lifetime<undefined, AppCause>({
	value: undefined,
	panics: definePanicRuntime(),
});
const log: string[] = [];
app.defer((cause) => {
	log.push(`log file closed (${cause})`);
});

assert(isolate(app.phase(), "Alive"));
app.end("shutdown");
assert(isolate(app.phase(), "Ended"));
assertEquals(log, ["log file closed (shutdown)"]);
```

`defer` registers a cleanup, and `end` runs it with the cause. The lifetime
went from `Alive` to `Ended` in one call, since its only cleanup is
synchronous. Calling `end` again would change nothing: the first cause wins.

## Grow a tree

Next, we give the app a database connection and a request in flight. Each is
a child: a lifetime of its own, holding its value, that the app ends when it
ends:

```ts
import { None, Some } from "@sekhmet/enum/option/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type AppCause = "shutdown" | "crashed";

const app = new Lifetime<undefined, AppCause>({
	value: undefined,
	panics: definePanicRuntime(),
});
const log: string[] = [];
app.defer(() => void log.push("log file closed"));
const db = app.child({ value: { port: 5432 } });
db.defer(() => void log.push("database closed"));
const request = app.child({ value: { path: "/orders" } });
request.defer(() => void log.push("request aborted"));

assertEquals(
	db.with((conn) => conn.port),
	Some(5432),
);
app.end("shutdown");
assertEquals(
	db.with((conn) => conn.port),
	None(),
);
assertEquals(log, ["request aborted", "database closed", "log file closed"]);
```

The teardown ran in reverse acquisition order: the request, acquired last,
went first, and the log file, acquired first, went last. Cleanups and
children share that one stack. And once the database's lifetime ended, its
value was gone: `with` ran nothing and returned `None`.

## Acquire through a resource

A database connection has a rising edge (connect) as well as a falling edge
(disconnect). A `Resource` pairs them, so every connection made through it
is released the same way. Its `start` returns a vow, settled at once when
`init` is synchronous:

```ts
import { isolate, union } from "@sekhmet/enum/core/mini";
import { unwrap } from "@sekhmet/panic/outcome/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { value } from "@sekhmet/vow/mini";
import { Resource } from "@sekhmet/lifetime";
import { assert, assertEquals } from "@std/assert";

type AppCause = "shutdown" | "crashed";

const log: string[] = [];
const database = new Resource<string, { readonly url: string }, AppCause>({
	init: (url) => {
		log.push(`connected to ${url}`);
		return { url };
	},
	deinit: (conn, cause) => {
		log.push(`disconnected from ${conn.url} (${cause})`);
	},
});

const started = value(
	database.start({ input: "postgres://orders", panics: definePanicRuntime() }),
);
assert(isolate(started, "Some"));
const db = unwrap(union(started));
db.end("shutdown");

assertEquals(log, [
	"connected to postgres://orders",
	"disconnected from postgres://orders (shutdown)",
]);
```

`start` gave back an `Outcome` from `@sekhmet/panic`: `Ok` with the
connection's lifetime, or `Panicked` with the panic if `init` had thrown.
Here it was `Ok`, and ending the lifetime ran `deinit` with the cause.

## Tear down with await using

Real connections close asynchronously. A lifetime awaits an async cleanup
before it runs the next one, and `await using` ends it when the block exits.
For that, the lifetime needs a dispose cause, the cause `using` ends it with:

```ts
import { unwrap } from "@sekhmet/panic/outcome/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { wait } from "@sekhmet/vow/mini";
import { Lifetime, Resource } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type AppCause = "shutdown" | "crashed";

const log: string[] = [];
const panics = definePanicRuntime();
const database = new Resource<string, { readonly url: string }, AppCause>({
	init: async (url) => {
		await Promise.resolve(); // the network round trip
		return { url };
	},
	deinit: async (conn, cause) => {
		await Promise.resolve();
		log.push(`disconnected from ${conn.url} (${cause})`);
	},
});

{
	await using app = new Lifetime<undefined, AppCause>({
		value: undefined,
		panics,
		disposeCause: "shutdown",
	});
	app.defer(() => void log.push("log file closed"));
	const db = unwrap(
		await wait(database.start({ input: "postgres://orders", panics })),
	);
	app.adopt({ child: db });
	db.with((conn) => void log.push(`serving from ${conn.url}`));
}

assertEquals(log, [
	"serving from postgres://orders",
	"disconnected from postgres://orders (shutdown)",
	"log file closed",
]);
```

`adopt` made the connection a child of the app, just as `child` did for a
fresh value. When the block exited, `await using` ended the app with
`"shutdown"`, which reached the connection, and waited for both to close.

## End a request from outside

Finally, a request should end when the client goes away, whatever the app is
doing. A request has its own causes, so it maps the app's into them with
`fromParent`, and `endWhen` links it to an outside signal:

```ts
import { DispatchController } from "@sekhmet/dispatch";
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type AppCause = "shutdown" | "crashed";
type RequestCause =
	| { readonly kind: "served" }
	| { readonly kind: "client gone" }
	| { readonly kind: "app ended"; readonly because: AppCause };
// {}

const panics = definePanicRuntime();
const app = new Lifetime<undefined, AppCause>({ value: undefined, panics });
const request = app.child({
	value: { path: "/orders" },
	fromParent: (because): RequestCause => ({ kind: "app ended", because }),
});
const forFetch = request.ending.toAbortSignal();
const disconnect = new DispatchController<RequestCause>({ panics });
request.endWhen(disconnect.signal);

disconnect.dispatch({ kind: "client gone" });
app.end("shutdown");

assertEquals(request.ending.poll(), Ready({ kind: "client gone" }));
assertEquals(forFetch.reason, { kind: "client gone" });
```

The client left first, so the request ended with its own cause and left the
app. When the app shut down later, the request was no longer its child, and
kept `"client gone"`. Its `ending` signal, turned into an `AbortSignal`, is
what we would hand to `fetch` for the request's upstream calls.

## What we built

We gave an app one root lifetime that owns everything it acquires: a log
file, a connection acquired through a `Resource`, and requests with causes
of their own. Ending the root releases all of it, last acquired first, and
`await using` makes that happen when a block exits.

From here:

- [Recipes](./recipes.md) show how to tear down several connections at
  once, cancel `fetch`, read a failed teardown, and more.
- [Concepts](./concepts.md) explain why a lifetime behaves as it does.

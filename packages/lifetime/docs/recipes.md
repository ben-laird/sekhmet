---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when you manage resources with a
lifetime. For every export, see the
[API reference](https://jsr.io/@sekhmet/lifetime/doc); for why a lifetime
behaves as it does, see the [concepts](./concepts.md).

## How to tear down several database connections at once

An app that talks to several databases (a primary and a replica through a
Prisma-style client, say) should disconnect all of them however it exits.

1. Wrap the client in a `Resource`: `init` connects, `deinit` disconnects.
2. Start one lifetime per connection and `adopt` each into a root lifetime.
3. Hold the root with `await using`, so leaving the block disconnects
   everything, last connected first.

```ts
import { unwrap } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { wait } from "@sekhmet/vow/mini";
import { Lifetime, Resource } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

/** Stands in for a generated database client, such as Prisma's. */
class FakeClient {
	readonly url: string;
	readonly #log: string[];

	constructor({ url, log }: { readonly url: string; readonly log: string[] }) {
		this.url = url;
		this.#log = log;
	}

	async $connect(): Promise<void> {
		await Promise.resolve();
		this.#log.push(`connect ${this.url}`);
	}

	async $disconnect(): Promise<void> {
		await Promise.resolve();
		this.#log.push(`disconnect ${this.url}`);
	}
}

type Cause = "shutdown" | "crashed";

const log: string[] = [];
const panics = definePanicRuntime();
const database = new Resource<string, FakeClient, Cause>({
	init: async (url) => {
		const client = new FakeClient({ url, log });
		await client.$connect();
		return client;
	},
	deinit: (client) => client.$disconnect(),
});

{
	await using app = new Lifetime<undefined, Cause>({
		value: undefined,
		panics,
		disposeCause: "shutdown",
	});
	for (const url of ["postgres://primary", "postgres://replica"]) {
		const connection = unwrap(
			await wait(database.start({ input: url, panics })),
		);
		app.adopt({ child: connection });
	}
	log.push("serving");
}

assertEquals(log, [
	"connect postgres://primary",
	"connect postgres://replica",
	"serving",
	"disconnect postgres://replica",
	"disconnect postgres://primary",
]);
```

A connection whose `init` fails comes back as `Err` and never joins the app,
so there is nothing of it to disconnect. To give up on the rest when one
fails, check the `Result` before adopting and let the block exit: the
connections already adopted are still released.

## How to cancel fetch when a lifetime ends

Pass `lifetime.ending.toAbortSignal()` to `fetch`, or any platform API that
takes an `AbortSignal`. It aborts with the lifetime's cause as its `reason`
when the lifetime starts ending, before its cleanups run.

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type Cause = { readonly kind: "navigated" } | { readonly kind: "closed" };

const page = new Lifetime<undefined, Cause>({
	value: undefined,
	panics: definePanicRuntime(),
});
const signal = page.ending.toAbortSignal();
// await fetch(url, { signal });

page.end({ kind: "navigated" });
assertEquals(signal.reason, { kind: "navigated" });
```

## How to end a lifetime on a timeout or a cancel

`endWhen` ends a lifetime when an outside `DispatchSignal` dispatches, with
its value as the cause. To race several, pass `DispatchSignal.any([...])`;
for a platform `AbortSignal`, adapt it with `DispatchSignal.fromAbortSignal`.

```ts
import { DispatchController, DispatchSignal } from "@sekhmet/dispatch";
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type Cause = "timed out" | "cancelled";

const panics = definePanicRuntime();
const job = new Lifetime<undefined, Cause>({ value: undefined, panics });
const timeout = new DispatchController<Cause>(panics.catchUnwind);
const user = new DispatchController<Cause>(panics.catchUnwind);
job.endWhen(DispatchSignal.any([timeout.signal, user.signal]));

user.dispatch("cancelled");
timeout.dispatch("timed out");

assertEquals(job.ending.poll(), Ready("cancelled"));
```

The link holds a listener on the outside signal until the lifetime ends, or
until you call the `Unsubscribe` that `endWhen` returns.

## How to give a child its own causes

A request inside an app ends for reasons of its own, as well as when the app
does. Give it its own cause type, and map the app's cause into it with
`fromParent`. The mapping runs when the app's teardown reaches the request,
not before, and not at all if the request has already ended.

```ts
import { Ready } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assertEquals } from "@std/assert";

type AppCause = "shutdown" | "crashed";
type RequestCause =
	| { readonly kind: "served" }
	| { readonly kind: "app ended"; readonly because: AppCause };
// {}

const app = new Lifetime<undefined, AppCause>({
	value: undefined,
	panics: definePanicRuntime(),
});
const served = app.child({
	value: "/health",
	fromParent: (because): RequestCause => ({ kind: "app ended", because }),
});
const pending = app.child({
	value: "/orders",
	fromParent: (because): RequestCause => ({ kind: "app ended", because }),
});

served.end({ kind: "served" });
app.end("crashed");

assertEquals(served.ending.poll(), Ready({ kind: "served" }));
assertEquals(
	pending.ending.poll(),
	Ready({ kind: "app ended", because: "crashed" }),
);
```

For a lifetime built separately, pass the same `fromParent` to
`adopt({ child, fromParent })`.

## How to build a resource on another resource

When a resource needs another one to exist (a repository on a connection),
start the inner one in the outer one's `init` and adopt it on `setup`.
What `setup` holds is released after the outer `deinit`, so the outer
resource can still use the inner one while it tears down. `setup`'s cause is
a `SetupEnd`: `Ended(cause)` after a normal end, or `InitPanicked(panic)` if
`init` failed partway.

```ts
import { isolate, union } from "@sekhmet/enum/core/mini";
import { unwrap } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { value, type Vow } from "@sekhmet/vow/mini";
import { Resource } from "@sekhmet/lifetime";
import { assert, assertEquals } from "@std/assert";

type Cause = "done";

function now<T>(vow: Vow<T>): T {
	const settled = value(vow);
	assert(isolate(settled, "Some"));
	return union(settled);
}

const panics = definePanicRuntime();
const order: string[] = [];
const connection = new Resource<string, string, "closed" | "aborted">({
	init: (url) => url,
	deinit: (url, cause) => void order.push(`disconnect ${url} (${cause})`),
});
const repository = new Resource<string, { readonly table: string }, Cause>({
	init: (table, setup) => {
		const conn = unwrap(now(connection.start({ input: "db://main", panics })));
		setup.adopt({
			child: conn,
			fromParent: (end) => (isolate(end, "Ended") ? "closed" : "aborted"),
		});
		return { table };
	},
	deinit: (repo) => void order.push(`flush ${repo.table}`),
});

const users = unwrap(now(repository.start({ input: "users", panics })));
users.end("done");

assertEquals(order, ["flush users", "disconnect db://main (closed)"]);
```

## How to see why a teardown failed

A cleanup that throws or rejects never stops the others: it becomes a
`Panic` in the report `ended` dispatches, and the panic runtime's hook
reports it. Read the report with `isErr` and `unwrapErr`; its `panics` are
in the order the cleanups ran.

```ts
import { isErr, unwrapErr } from "@sekhmet/enum/result/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assert, assertEquals } from "@std/assert";

const panics = definePanicRuntime();
panics.setHook(() => {}); // keep the example quiet
const lifetime = new Lifetime<undefined, string>({ value: undefined, panics });
lifetime.defer(() => Promise.reject(new Error("disk full")));
lifetime.defer(() => {
	throw new Error("socket already closed");
});

const report = await lifetime.end("shutdown").wait();

assert(isErr(report));
const { cause, panics: failures } = unwrapErr(report);
assertEquals(cause, "shutdown");
assertEquals(
	failures.map((failure) => failure.message),
	["socket already closed", "disk full"],
);
```

Under `using` or `await using`, the same failures are thrown instead: one
panic as it is, several chained as `SuppressedError`s, the latest outermost.

## How to take a cleanup back

`defer` returns a `Registration`. While the lifetime is alive, it is
`Registered(unregister)`; call `unregister` to remove the cleanup, for
instance once you have released the resource yourself.

```ts
import { match } from "@sekhmet/enum/core/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { Lifetime } from "@sekhmet/lifetime";
import { assert, assertEquals } from "@std/assert";

const lifetime = new Lifetime<undefined, string>({
	value: undefined,
	panics: definePanicRuntime(),
});
const ran: string[] = [];
const registration = lifetime.defer(() => void ran.push("close temp file"));

const removed = match(registration)({
	Registered: (unregister) => unregister(),
	DuringEnd: () => false,
	AfterEnd: () => false,
});
lifetime.end("done");

assert(removed);
assertEquals(ran, []);
```

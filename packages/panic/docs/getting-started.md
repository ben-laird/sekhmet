---
kind: tutorial
---

# Getting started

In this tutorial we will run a small program inside a panic runtime. We will
create the runtime, run some work through it, make that work panic, watch the
runtime report the panic, and recover from it with a fallback value. Each step
is a complete program you can run.

## Install

Add the package, `@sekhmet/enum`, whose `Result` helpers we will use to read
what a boundary returns, and `@std/assert`, which each step uses to check its
output:

```sh
deno add jsr:@sekhmet/panic jsr:@sekhmet/enum jsr:@std/assert
```

## Run work inside a runtime

First, we create a runtime and run a function through its `catchUnwind`
boundary:

```ts
import { definePanicRuntime } from "@sekhmet/panic";
import { Ok } from "@sekhmet/enum/result/mini/core";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();

const port = (): number => 8080;
const result = runtime.catchUnwind(port);

assertEquals(result, Ok(8080));
```

The function returned normally, so `catchUnwind` hands its value back wrapped
in `Ok`.

## Panic

Now let's make the function panic, as it would if its config had no port:

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { isErr } from "@sekhmet/enum/result/mini/predicates";
import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { assert, assertEquals } from "@std/assert";

const runtime = definePanicRuntime();

function port(): number {
	panic({ message: "config is missing a port", cause: null });
}
const result = runtime.catchUnwind(port);

assert(isErr(result));
const payload = unwrapErr(result);
assert(payload instanceof Panic);
assertEquals(payload.message, "config is missing a port");
```

`panic` threw a `Panic`, and the boundary caught it: the result is an `Err`
holding the thrown value. Notice that the program kept running after the
panic.

Run it, and you will also see a report on standard error that starts with
`panicked: Panic: config is missing a port`, followed by the stack. That is
the runtime's hook at work.

## Watch the hook report

The hook is how a runtime reports a panic. A new runtime's hook writes to
`console.error`; let's replace it with one that collects the reports, so we
can check them:

```ts
import { definePanicRuntime, Panic, panic } from "@sekhmet/panic";
import { assert, assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const reports: unknown[] = [];
runtime.setHook(({ payload }) => {
	reports.push(payload);
});

function port(): number {
	panic({ message: "config is missing a port", cause: null });
}
runtime.catchUnwind(port);

assertEquals(reports.length, 1);
const [report] = reports;
assert(report instanceof Panic);
assertEquals(report.message, "config is missing a port");
```

The boundary called our hook once, with the panic as its payload, before it
returned the `Err`. Nothing was written to standard error this time.

## Recover with a fallback

Finally, we turn the `Err` into something the program can use. Here a panic
while reading the port falls back to a default:

```ts
import { definePanicRuntime, panic } from "@sekhmet/panic";
import { unwrapOr } from "@sekhmet/enum/result/mini/unwrap";
import { assertEquals } from "@std/assert";

const runtime = definePanicRuntime();
const reports: unknown[] = [];
runtime.setHook(({ payload }) => {
	reports.push(payload);
});

function port(): number {
	panic({ message: "config is missing a port", cause: null });
}
const chosen = unwrapOr(runtime.catchUnwind(port), 3000);

assertEquals(chosen, 3000);
assertEquals(reports.length, 1);
```

The program kept going with a usable port.

## What we built

You have run a program inside a panic runtime, made it panic, watched the
hook report the panic once, and recovered from it at the boundary, which
handed you a `Result` to decide with. Reporting and recovery are two separate
steps: the hook never decides what the program does next.

From here:

- [Recipes](./recipes.md) show how to report panics to a logger, recover from
  async work, pass a panic on to an outer boundary, attach a cause and keep
  your own metadata about panics.
- [Concepts](./concepts.md) explain why there is one runtime per program and
  no global state, how a panic differs from an error value, and why each panic
  is reported once per runtime.
- The [API reference on JSR](https://jsr.io/@sekhmet/panic/doc) documents
  every export.

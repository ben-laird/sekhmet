---
kind: tutorial
---

# Getting started

In this tutorial we will build the error handling of a small config loader.
We will describe a missing config file as an issue, handle it with a default,
try a backup first, fetch a remote config asynchronously, and finally wrap
the missing file in a load failure that a person can read. Each step is a
complete program you can run.

## 1. Describe the problem as an issue

An issue is one occurrence of something going wrong. It has a permanent
`code`, a `message`, and optionally a `hint` and a `docs` link. It also holds
a **value**: the typed facts about the problem. Here the value is the path we
looked for.

Its second type parameter is the **residue**: what handling the issue yields.
For a missing config, that is the config to use instead.

```ts
import { issue } from "@sekhmet/issue/issue";
import { assertEquals } from "@std/assert";

interface Config {
	readonly port: number;
}
interface Path {
	readonly path: string;
}

const notFound = issue<Path, Config>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file at `app.json`.",
	hint: "Create one, or run with the default config.",
});

assertEquals(notFound.isUnhandled(), true);
assertEquals(notFound.value().unwrap(), { path: "app.json" });
assertEquals(notFound.code(), "config/NotFound");
```

A new issue is **unhandled**: it holds its value, and no residue yet.

## 2. Handle it with a default

A recovery is a typed repair: given the issue's value, it yields the residue
or an error. `succeed` builds one that always yields the same residue.
Attempting it on the issue switches the issue **in place** to handled.

```ts
import { issue } from "@sekhmet/issue/issue";
import { succeed } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

interface Config {
	readonly port: number;
}

const notFound = issue<{ readonly path: string }, Config>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file at `app.json`.",
});

const ended = await wait(notFound.attempt(succeed({ port: 8080 })));

assertEquals(ended.isHandled(), true);
assertEquals(notFound.isHandled(), true);
assertEquals(notFound.unwrapResidue(), { port: 8080 });
```

`attempt` returns a `Vow`, a promise-like value that resolves synchronously
when the recovery is sync. `wait` turns it into a `Promise`. The attempt
itself is `Handled(residue)`: this attempt handled the issue.

Attempting again doesn't run the recovery: the issue is already handled, so
the attempt is `AlreadyHandled` with the residue it holds. An issue never
switches back.

## 3. Try a backup first

Recoveries compose. `orElse` tries the next one when the first fails. Here
reading a backup fails, so the default handles the issue. The failed
recovery's type says which residue it stands in for.

```ts
import { issue } from "@sekhmet/issue/issue";
import { fail, type Recovery, succeed } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

interface Config {
	readonly port: number;
}
interface Path {
	readonly path: string;
}

const notFound = issue<Path, Config>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file at `app.json`.",
});

const readBackup: Recovery<Path, Config, string> = fail(
	"`app.bak` can't be read.",
);
const recovery = readBackup.orElse(succeed({ port: 8080 }));

const ended = await wait(notFound.attempt(recovery));

assertEquals(ended.isHandled(), true);
assertEquals(notFound.unwrapResidue(), { port: 8080 });
```

Had both failed, the attempt would be `Failed` with the last error, and the
issue would still be unhandled, ready for another attempt.

## 4. Fetch a remote config

A recovery can be async. `fromPromise` builds one from a function that
returns a promise: fulfilment is the residue, and a rejection is the error.
It takes a panic runtime, which reports a bug in code that runs when the
recovery settles.

```ts
import { issue } from "@sekhmet/issue/issue";
import { fromPromise } from "@sekhmet/issue/recovery";
import { definePanicRuntime } from "@sekhmet/panic";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

interface Config {
	readonly port: number;
}
interface Path {
	readonly path: string;
}

const notFound = issue<Path, Config>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file at `app.json`.",
});

const fetchRemote = fromPromise({
	repair: async ({ path }: Path): Promise<Config> => {
		await Promise.resolve(); // stands in for a fetch of `path`
		return { port: path === "app.json" ? 9000 : 80 };
	},
	panics: definePanicRuntime(),
});

const attempt = notFound.attempt(fetchRemote);
assertEquals(notFound.isUnhandled(), true); // still fetching

const ended = await wait(attempt);
assertEquals(ended.isHandled(), true);
assertEquals(notFound.unwrapResidue(), { port: 9000 });
```

The issue stays unhandled until the fetch settles. If two attempts run at
the same time, the first to finish handles the issue, and the other reports
`AlreadyHandled` with that residue.

## 5. Wrap the cause, and render it

A missing file is the cause of a bigger problem: the config couldn't be
loaded. `wrap` makes a new issue whose value holds the first one as its
`cause`. `render` prints the issue and its chain of causes for a person.

```ts
import { issue } from "@sekhmet/issue/issue";
import { assertEquals } from "@std/assert";

interface Config {
	readonly port: number;
}

const notFound = issue<{ readonly path: string }, Config>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file at `app.json`.",
	hint: "Create one, or run with the default config.",
});

const loadFailed = notFound.wrap({
	code: "config/LoadFailed",
	message: "Couldn't load the config for `api`.",
	docs: "https://example.com/config",
});

assertEquals(
	loadFailed.render(),
	[
		"config/LoadFailed: Couldn't load the config for `api`.",
		"  docs: https://example.com/config",
		"caused by config/NotFound: No config file at `app.json`.",
		"  hint: Create one, or run with the default config.",
	].join("\n"),
);
```

## What we built

We described a problem as an issue with typed facts, handled it in place with
a recovery, composed recoveries, recovered asynchronously, and rendered a
chain of causes. Next:

- the [recipes](./recipes.md) show how to retry, recover only some values,
  recover a wrapped issue through its cause, and recover the issue in an
  `Err`;
- the [concepts](./concepts.md) explain why an issue switches in place, why
  it is invariant, and how concurrent attempts settle.

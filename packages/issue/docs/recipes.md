---
kind: how-to
---

# Recipes

How-to guides for tasks that come up when you handle issues. For every
export, see the [API reference](https://jsr.io/@sekhmet/issue/doc); for why
issues behave as they do, see the [concepts](./concepts.md).

## How to try several recoveries in order

Use `firstOf` with the recoveries in the order to try them. It stops at the
first success; when all fail, it fails with the last one's error. The list
can't be empty.

```ts
import { issue } from "@sekhmet/issue/issue";
import { fail, firstOf, succeed } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const notFound = issue<string, number>({
	value: "app.json",
	code: "config/NotFound",
	message: "No config file.",
});

const recovery = firstOf([
	fail<string, string>("no backup"),
	fail<string, string>("no remote"),
	succeed<string, number>(8080),
]);

assertEquals((await wait(notFound.attempt(recovery))).unwrap(), 8080);
```

## How to retry a flaky recovery

Use `retry` with how many more times to run it after a failure. Each run
starts once the previous one has settled; when they all fail, the last error
is kept.

```ts
import { Err, Ok } from "@sekhmet/enum/result/mini";
import { issue } from "@sekhmet/issue/issue";
import { sync } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const notFound = issue<string, number>({
	value: "app.json",
	code: "config/NotFound",
	message: "No config file.",
});

let tries = 0;
const flaky = sync((_path: string) => {
	tries += 1;
	return tries < 3 ? Err(`try ${tries} failed`) : Ok(9000);
});

const ended = await wait(notFound.attempt(flaky.retry({ times: 4 })));

assertEquals(ended.isHandled(), true);
assertEquals(tries, 3);
```

## How to recover only some values

Use `when` with a `test` on the value, and the error to fail with for a value
that doesn't pass. The recovery doesn't run for those.

```ts
import { issue } from "@sekhmet/issue/issue";
import { type Recovery, succeed } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const useDevPort: Recovery<string, number, never> = succeed(3000);
const devOnly = useDevPort.when({
	test: (path) => path.startsWith("dev"),
	otherwise: "only dev configs have a default",
});

const app = issue<string, number>({
	value: "app.json",
	code: "config/NotFound",
	message: "No config file.",
});
const ended = await wait(app.attempt(devOnly));

assertEquals(ended.unwrapFailed(), "only dev configs have a default");
assertEquals(app.isUnhandled(), true);
```

## How to recover a wrapped issue through its cause

A wrapped issue's value is `{ cause }`. Recover the cause, then hand its
residue up: attempt the cause inside a recovery of the wrapper. `mapInput`
adapts a recovery of the cause's value to the wrapper's.

```ts
import { match } from "@sekhmet/enum/core/mini";
import { Ok } from "@sekhmet/enum/result/mini";
import { attempt } from "@sekhmet/issue/issue/mini";
import { issue, type Wrapped } from "@sekhmet/issue/issue";
import { Recovery, succeed } from "@sekhmet/issue/recovery";
import { map, wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

const notFound = issue<string, number>({
	value: "app.json",
	code: "config/NotFound",
	message: "No config file.",
});
const loadFailed = notFound.wrap({
	code: "config/LoadFailed",
	message: "Couldn't load the config.",
});

const viaCause = new Recovery(({ cause }: Wrapped<string, number>) => {
	return map(attempt(cause, succeed(8080)), (ended) => {
		return match(ended)({
			AlreadyHandled: (port) => Ok<number, never>(port),
			Handled: (port) => Ok<number, never>(port),
			Failed: (never) => never,
		});
	});
});

await wait(loadFailed.attempt(viaCause));

assertEquals(loadFailed.unwrapResidue(), 8080);
assertEquals(notFound.unwrapResidue(), 8080);
```

## How to recover the issue in an `Err`

A function that can fail with an issue returns `Result<R, Issue<T, R>>`. Use
`recoverWith` to attempt the issue: the `Err` becomes `Ok(residue)` once the
issue is handled, and stays an `Err` with the same issue if the recovery
fails.

```ts
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { type Issue, issue, recoverWith } from "@sekhmet/issue/issue";
import { succeed } from "@sekhmet/issue/recovery";
import { wait } from "@sekhmet/vow";
import { assertEquals } from "@std/assert";

function readPort(path: string): Result<number, Issue<string, number>> {
	if (path === "app.json") return Ok(80);
	return Err(
		issue({ value: path, code: "config/NotFound", message: "No config file." }),
	);
}

const port = await wait(recoverWith(readPort("dev.json"), succeed(3000)));

assertEquals(port.unwrap(), 3000);
```

## How to handle an issue without a recovery

When the residue is already at hand, use `handle`. It switches an unhandled
issue at once, and leaves a handled one as it is.

```ts
import { issue } from "@sekhmet/issue/issue";
import { assertEquals } from "@std/assert";

const notFound = issue<string, number>({
	value: "app.json",
	code: "config/NotFound",
	message: "No config file.",
});

assertEquals(notFound.handle(8080).isHandled(), true);
assertEquals(notFound.handle(3000).isAlreadyHandled(), true);
assertEquals(notFound.unwrapResidue(), 8080);
```

## How to narrow an issue's state

Read the state with `state()` and narrow that, not the issue: the issue
switches in place, but a state is a snapshot that never changes, so its
`isUnhandled` and `isHandled` are type guards. Narrowed, the variant's value
reads directly with enum's `union`.

```ts
import { union } from "@sekhmet/enum/core/mini";
import { issue } from "@sekhmet/issue/issue";
import { assertEquals } from "@std/assert";

const notFound = issue<{ readonly path: string }, number>({
	value: { path: "app.json" },
	code: "config/NotFound",
	message: "No config file.",
});

const current = notFound.state();
if (current.isUnhandled()) {
	const { path } = union(current);
	assertEquals(path, "app.json");
}
```

## How to render an issue for a person

Use `render`. It prints the code and message, the hint and docs when there
are any, and each cause of a wrapped chain; a handled issue is marked.

```ts
import { issue } from "@sekhmet/issue/issue";
import { assertEquals } from "@std/assert";

const notFound = issue<string, number>({
	value: "app.json",
	code: "config/NotFound",
	message: "No config file at `app.json`.",
	hint: "Create one.",
	docs: "https://example.com/config",
});

assertEquals(
	notFound.render(),
	[
		"config/NotFound: No config file at `app.json`.",
		"  hint: Create one.",
		"  docs: https://example.com/config",
	].join("\n"),
);
```

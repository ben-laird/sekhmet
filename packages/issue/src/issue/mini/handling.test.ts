import { isolate, match, union } from "@sekhmet/enum/core/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import {
	isPending,
	map,
	resolved,
	type Vow,
	value as vowValue,
	vowWithResolver,
	wait,
} from "@sekhmet/vow/mini";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { AlreadyHandled, Handled } from "@/src/attempt/mini/core.ts";
import { or } from "@/src/recovery/mini/combinators.ts";
import { fail, Recovery, succeed } from "@/src/recovery/mini/core.ts";
import { state } from "./accessors.ts";
import { type Issue, issue } from "./core.ts";
import { attempt, handle, recoverWith } from "./handling.ts";

// A config domain.

interface Config {
	readonly port: number;
}
interface Path {
	readonly path: string;
}

const DEFAULT_CONFIG: Config = { port: 8080 };

function notFound(path: string): Issue<Path, Config> {
	return issue<Path, Config>({
		value: { path },
		code: "config/NotFound",
		message: `No config file at \`${path}\`.`,
		hint: "Create one, or run with the default config.",
	});
}

const useDefault: Recovery<Path, Config, never> = new Recovery(() => {
	return resolved(Ok(DEFAULT_CONFIG));
});

const readBackup: Recovery<Path, Config, string> = new Recovery(() => {
	return resolved(Err("`app.bak` can't be read."));
});

/** A recovery that settles only when the test resolves it. */
function deferred<E>(): {
	recovery: Recovery<Path, Config, E>;
	settle: (result: Result<Config, E>) => void;
} {
	const { vow, resolve } = vowWithResolver<Result<Config, E>>();
	return { recovery: new Recovery(() => vow), settle: resolve };
}

/** A settled vow's value. */
function settled<T>(vow: Vow<T>): T {
	const current = vowValue(vow);
	assert(isolate(current, "Some"), "expected a settled vow");
	return union(current);
}

Deno.test("a recovery that succeeds switches the issue in place", () => {
	// Given: an unhandled issue
	const notFoundIssue = notFound("app.json");

	// When: useDefault is attempted
	const ended = settled(attempt(notFoundIssue, useDefault));

	// Then: the attempt handled it, and the same issue now holds the residue
	assert(isolate(ended, "Handled"));
	assertEquals(union(ended), DEFAULT_CONFIG);
	const current = state(notFoundIssue);
	assert(isolate(current, "Handled"));
	assertStrictEquals(union(current), DEFAULT_CONFIG);
});

Deno.test("a recovery that fails leaves the issue unhandled", () => {
	// Given: an issue and a recovery whose backup read fails
	const notFoundIssue = notFound("app.json");

	// When: it is attempted
	const ended = settled(attempt(notFoundIssue, readBackup));

	// Then: it failed with the error, and the issue still holds its value
	assert(isolate(ended, "Failed"));
	assertEquals(union(ended), "`app.bak` can't be read.");
	assert(isolate(state(notFoundIssue), "Unhandled"));
});

Deno.test("a handled issue isn't recovered again", () => {
	// Given: an issue already handled by useDefault, and a counting recovery
	const notFoundIssue = notFound("app.json");
	attempt(notFoundIssue, useDefault);
	let runs = 0;
	const other = new Recovery((_: Path) => {
		runs += 1;
		return resolved(Ok<Config, never>({ port: 1 }));
	});

	// When: a second recovery is attempted
	const ended = settled(attempt(notFoundIssue, other));

	// Then: it didn't run, and the first residue stands
	assertEquals(runs, 0);
	assert(isolate(ended, "AlreadyHandled"));
	assertEquals(union(ended), DEFAULT_CONFIG);
});

Deno.test("a recovery reads the issue's value", () => {
	// Given: a recovery that derives the residue from the path
	const notFoundIssue = notFound("dev.json");
	const byName = new Recovery(({ path }: Path) => {
		return resolved(
			Ok<Config, never>({ port: path === "dev.json" ? 3000 : 80 }),
		);
	});

	// When: it is attempted
	const ended = settled(attempt(notFoundIssue, byName));

	// Then: the residue came from the value
	assert(isolate(ended, "Handled"));
	assertEquals(union(ended), { port: 3000 });
});

Deno.test("or: a failure moves on to the next recovery", () => {
	// Given: readBackup, which fails, then useDefault
	const notFoundIssue = notFound("app.json");
	const recovery = or(readBackup, useDefault);

	// When: the composed recovery is attempted
	const ended = settled(attempt(notFoundIssue, recovery));

	// Then: useDefault handled it
	assert(isolate(ended, "Handled"));
	assertEquals(union(ended), DEFAULT_CONFIG);
});

Deno.test("or: a success doesn't run the next recovery", () => {
	// Given: useDefault, then a recovery that counts its runs
	const notFoundIssue = notFound("app.json");
	let runs = 0;
	const counting = new Recovery((_: Path) => {
		runs += 1;
		return resolved(Err<Config, string>("unreachable"));
	});

	// When: the composition is attempted
	const ended = settled(attempt(notFoundIssue, or(useDefault, counting)));

	// Then: the first one handled it, and the second never ran
	assert(isolate(ended, "Handled"));
	assertEquals(runs, 0);
});

Deno.test("or: when both fail, the last error is the one reported", () => {
	// Given: two recoveries that both fail
	const notFoundIssue = notFound("app.json");
	const askUser = new Recovery((_: Path) => {
		return resolved(Err<Config, number>(130));
	});

	// When: they are composed and attempted
	const ended = settled(attempt(notFoundIssue, or(readBackup, askUser)));

	// Then: it failed with the second error, and the issue is still unhandled
	assert(isolate(ended, "Failed"));
	assertEquals(union(ended), 130);
	assert(isolate(state(notFoundIssue), "Unhandled"));
});

Deno.test("an async recovery switches the issue when it settles", async () => {
	// Given: an issue and a recovery waiting on a remote fetch
	const notFoundIssue = notFound("app.json");
	const remote = deferred<never>();

	// When: it is attempted, then the fetch settles
	const pending = attempt(notFoundIssue, remote.recovery);
	const before = state(notFoundIssue);
	remote.settle(Ok({ port: 9000 }));

	// Then: the issue stayed unhandled until then, and is handled after
	assert(isolate(before, "Unhandled"));
	const ended = await wait(pending);
	assert(isolate(ended, "Handled"));
	assertEquals(union(ended), { port: 9000 });
	assert(isolate(state(notFoundIssue), "Handled"));
});

Deno.test("concurrent attempts: the first to finish handles the issue", async () => {
	// Given: two async recoveries attempted on the same unhandled issue
	const notFoundIssue = notFound("app.json");
	const slow = deferred<never>();
	const fast = deferred<never>();
	const first = attempt(notFoundIssue, slow.recovery);
	const second = attempt(notFoundIssue, fast.recovery);

	// When: the one started second finishes first
	fast.settle(Ok({ port: 2 }));
	slow.settle(Ok({ port: 1 }));

	// Then: it handled the issue, and the other reports its residue
	const fastEnded = await wait(second);
	const slowEnded = await wait(first);
	assert(isolate(fastEnded, "Handled"));
	assert(isolate(slowEnded, "AlreadyHandled"));
	assertEquals(union(slowEnded), { port: 2 });
	const current = state(notFoundIssue);
	assert(isolate(current, "Handled"));
	assertEquals(union(current), { port: 2 });
});

Deno.test("concurrent attempts: a late failure still reports the handling", async () => {
	// Given: a failing recovery still running when another handles the issue
	const notFoundIssue = notFound("app.json");
	const failing = deferred<string>();
	const pending = attempt(notFoundIssue, failing.recovery);
	attempt(notFoundIssue, useDefault);

	// When: the failing one settles afterwards
	failing.settle(Err("timed out"));

	// Then: the issue is handled, so it reports AlreadyHandled, not Failed
	const ended = await wait(pending);
	assert(isolate(ended, "AlreadyHandled"));
	assertEquals(union(ended), DEFAULT_CONFIG);
});

Deno.test("concurrent attempts: an early failure reports Failed, and the issue waits for the winner", async () => {
	// Given: a failing and a succeeding recovery, both in flight
	const notFoundIssue = notFound("app.json");
	const failing = deferred<string>();
	const winning = deferred<never>();
	const lost = attempt(notFoundIssue, failing.recovery);
	const won = attempt(notFoundIssue, winning.recovery);

	// When: the failing one settles first, then the winner
	failing.settle(Err("timed out"));
	const between = state(notFoundIssue);
	const failed = await wait(lost);
	winning.settle(Ok({ port: 9000 }));

	// Then: the failure is Failed, the issue stayed unhandled until the winner
	// settled, and the winner handled it
	assert(isolate(failed, "Failed"));
	assertEquals(union(failed), "timed out");
	assert(isolate(between, "Unhandled"));
	assertEquals(await wait(won), Handled({ port: 9000 }));
	assert(isolate(state(notFoundIssue), "Handled"));
});

Deno.test("or: an async failure moves on to a sync recovery", async () => {
	// Given: an async recovery that will fail, then useDefault
	const notFoundIssue = notFound("app.json");
	const remote = deferred<string>();
	const pending = attempt(notFoundIssue, or(remote.recovery, useDefault));
	assert(isPending(pending));

	// When: the async one fails
	remote.settle(Err("offline"));

	// Then: useDefault handled it
	const ended = await wait(pending);
	assert(isolate(ended, "Handled"));
	assertEquals(union(ended), DEFAULT_CONFIG);
});

Deno.test("a cause is just part of the value", () => {
	// Given: a LoadFailed issue whose value carries the NotFound that led to it
	const cause = notFound("app.json");
	const loadFailed = issue<
		{ readonly app: string; readonly cause: Issue<Path, Config> },
		Config
	>({
		value: { app: "api", cause },
		code: "config/LoadFailed",
		message: "Couldn't load the config for `api`.",
	});

	// When: a recovery handles the cause, then hands its residue up
	const viaCause = new Recovery(
		({ cause }: { readonly cause: Issue<Path, Config> }) => {
			return map(attempt(cause, useDefault), (ended) => {
				return match(ended)({
					AlreadyHandled: (config) => Ok<Config, never>(config),
					Handled: (config) => Ok<Config, never>(config),
					Failed: (never) => never,
				});
			});
		},
	);
	const ended = settled(attempt(loadFailed, viaCause));

	// Then: both are handled, with no cause support in Issue itself
	assert(isolate(ended, "Handled"));
	assert(isolate(state(cause), "Handled"));
});

Deno.test("handle() switches an unhandled issue in place", () => {
	// Given: an unhandled issue
	const notFoundIssue = notFound("app.json");

	// When: it is handled directly
	const ended = handle(notFoundIssue, DEFAULT_CONFIG);

	// Then: it is Handled, and the issue holds the residue
	assertEquals(ended, Handled(DEFAULT_CONFIG));
	const current = state(notFoundIssue);
	assert(isolate(current, "Handled"));
	assertStrictEquals(union(current), DEFAULT_CONFIG);
});

Deno.test("handle() never switches a handled issue back or again", () => {
	// Given: an issue handled once
	const notFoundIssue = notFound("app.json");
	handle(notFoundIssue, DEFAULT_CONFIG);

	// When: it is handled again with another residue
	const ended = handle(notFoundIssue, { port: 1 });

	// Then: the first residue stands
	assertEquals(ended, AlreadyHandled(DEFAULT_CONFIG));
	assertEquals(union(state(notFoundIssue)), DEFAULT_CONFIG);
});

Deno.test("handle() wins over an attempt still running", async () => {
	// Given: an async attempt in flight
	const notFoundIssue = notFound("app.json");
	const remote = deferred<never>();
	const pending = attempt(notFoundIssue, remote.recovery);

	// When: the issue is handled directly, then the recovery succeeds
	handle(notFoundIssue, DEFAULT_CONFIG);
	remote.settle(Ok({ port: 9000 }));

	// Then: the attempt reports the handling it lost to
	assertEquals(await wait(pending), AlreadyHandled(DEFAULT_CONFIG));
	assertEquals(union(state(notFoundIssue)), DEFAULT_CONFIG);
});

Deno.test("recoverWith(): an Ok passes through without running the recovery", () => {
	// Given: an Ok, and a counting recovery
	let runs = 0;
	const counting = new Recovery((_: Path) => {
		runs += 1;
		return resolved(Ok<Config, never>({ port: 1 }));
	});
	const loaded: Result<Config, Issue<Path, Config>> = Ok(DEFAULT_CONFIG);

	// When: it is recovered
	const result = settled(recoverWith(loaded, counting));

	// Then: it is the same residue, and the recovery never ran
	assertEquals(result, Ok(DEFAULT_CONFIG));
	assertEquals(runs, 0);
});

Deno.test("recoverWith(): an Err becomes Ok once the recovery handles its issue", () => {
	// Given: an Err holding an unhandled issue
	const notFoundIssue = notFound("app.json");
	const loaded: Result<Config, Issue<Path, Config>> = Err(notFoundIssue);

	// When: it is recovered with useDefault
	const result = settled(recoverWith(loaded, useDefault));

	// Then: it is Ok with the residue, and the issue switched in place
	assertEquals(result, Ok(DEFAULT_CONFIG));
	assert(isolate(state(notFoundIssue), "Handled"));
});

Deno.test("recoverWith(): an Err whose issue was already handled becomes Ok", () => {
	// Given: an Err holding an issue handled before
	const notFoundIssue = notFound("app.json");
	handle(notFoundIssue, { port: 1 });
	const loaded: Result<Config, Issue<Path, Config>> = Err(notFoundIssue);

	// When: it is recovered with a recovery that would fail
	const result = settled(recoverWith(loaded, readBackup));

	// Then: the earlier residue is the Ok
	assertEquals(result, Ok({ port: 1 }));
});

Deno.test("recoverWith(): a failed recovery keeps the same, unhandled issue", async () => {
	// Given: an Err, and an async recovery that will fail
	const notFoundIssue = notFound("app.json");
	const loaded: Result<Config, Issue<Path, Config>> = Err(notFoundIssue);
	const remote = deferred<string>();

	// When: it is recovered, and the recovery fails
	const pending = recoverWith(loaded, remote.recovery);
	remote.settle(Err("offline"));
	const result = await wait(pending);

	// Then: the Err holds the very same issue, still unhandled
	assert(isolate(result, "Err"));
	assertStrictEquals(union(result), notFoundIssue);
	assert(isolate(state(notFoundIssue), "Unhandled"));
});

Deno.test("attempt() of a handled issue resolves at once, even with an async recovery", () => {
	// Given: a handled issue and a recovery that never settles
	const notFoundIssue = notFound("app.json");
	handle(notFoundIssue, DEFAULT_CONFIG);
	const never = deferred<never>();

	// When: the recovery is attempted
	const ended = attempt(notFoundIssue, never.recovery);

	// Then: it is already AlreadyHandled
	assertEquals(settled(ended), AlreadyHandled(DEFAULT_CONFIG));
});

Deno.test("attempt() accepts fail and succeed recoveries of the issue's types", () => {
	// Given: an issue, and recoveries built from the constructors
	const notFoundIssue = notFound("app.json");

	// When: a failing one, then a succeeding one, is attempted
	const failed = settled(attempt(notFoundIssue, fail<Path, string>("nope")));
	const handled = settled(
		attempt(notFoundIssue, succeed<Path, Config>(DEFAULT_CONFIG)),
	);

	// Then: the first failed and the second handled it
	assert(isolate(failed, "Failed"));
	assertEquals(handled, Handled(DEFAULT_CONFIG));
});

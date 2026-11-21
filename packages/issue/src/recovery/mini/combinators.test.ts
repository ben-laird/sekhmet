import { Some } from "@sekhmet/enum/option/mini";
import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { Panic } from "@sekhmet/panic/mini/core";
import {
	isPending,
	resolved,
	value,
	vowWithResolver,
	wait,
} from "@sekhmet/vow/mini";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { firstOf, orElse, retry, when } from "./combinators.ts";
import { fail, Recovery, run, succeed, sync } from "./core.ts";

/** A recovery that counts its runs and yields what `results` says next. */
function scripted<R, E>(
	results: readonly Result<R, E>[],
): { recovery: Recovery<string, R, E>; runs: () => number } {
	let count = 0;
	const recovery = new Recovery((_: string) => {
		const result = results[Math.min(count, results.length - 1)];
		count += 1;
		if (result === undefined) throw new Error("scripted needs a result");
		return resolved(result);
	});
	return { recovery, runs: () => count };
}

Deno.test("orElse(): a failure moves on to the next recovery, on the same value", () => {
	// Given: a failing recovery, then one that reads the value
	const readBackup: Recovery<string, number, string> = fail("no backup");
	const byLength = sync((path: string) => Ok<number, never>(path.length));

	// When: the composition is run
	const result = value(run(orElse(readBackup, byLength), "app.json"));

	// Then: the second one's residue came from the same value
	assertEquals(result, Some(Ok(8)));
});

Deno.test("orElse(): a success never runs the next recovery", () => {
	// Given: a recovery that succeeds, then a counting one
	const next = scripted<number, string>([Err("unreachable")]);

	// When: the composition is run
	const result = value(run(orElse(succeed(1), next.recovery), "app.json"));

	// Then: the first residue stands, and the second never ran
	assertEquals(result, Some(Ok(1)));
	assertEquals(next.runs(), 0);
});

Deno.test("orElse(): when both fail, the second error is reported", () => {
	// Given: two failing recoveries with different error types
	const first: Recovery<string, number, string> = fail("no backup");
	const second: Recovery<string, number, number> = fail(130);

	// When: the composition is run
	const result = value(run(orElse(first, second), "app.json"));

	// Then: the first error was dropped
	assertEquals(result, Some(Err(130)));
});

Deno.test("orElse(): an async failure moves on once it settles", async () => {
	// Given: an async recovery that will fail, then a sync success
	const { vow, resolve } = vowWithResolver<Result<number, string>>();
	const remote = new Recovery((_: string) => vow);
	const result = run(orElse(remote, succeed(8080)), "app.json");
	const before = isPending(result);

	// When: the async one fails
	resolve(Err("offline"));

	// Then: it was pending, and the fallback's residue is the result
	assert(before);
	assertEquals(await wait(result), Ok(8080));
});

Deno.test("firstOf(): tries each in order and stops at the first success", () => {
	// Given: two failures, a success, and a counting recovery after it
	const after = scripted<number, string>([Ok(2)]);
	const recovery = firstOf([
		fail<string, string>("no backup"),
		fail<string, string>("no remote"),
		succeed<string, number>(1),
		after.recovery,
	]);

	// When: it is run
	const result = value(run(recovery, "app.json"));

	// Then: the first success won, and nothing after it ran
	assertEquals(result, Some(Ok(1)));
	assertEquals(after.runs(), 0);
});

Deno.test("firstOf(): when all fail, the last error is reported", () => {
	// Given: recoveries that all fail
	const recovery = firstOf([
		fail<string, string>("a"),
		fail<string, string>("b"),
	]);

	// When: it is run
	const result = value(run(recovery, "app.json"));

	// Then: the last error is the result
	assertEquals(result, Some(Err("b")));
});

Deno.test("firstOf(): one recovery is that recovery's behavior", () => {
	// Given: a single recovery
	const only = succeed<string, number>(7);

	// When: firstOf wraps it alone
	const result = value(run(firstOf([only]), "app.json"));

	// Then: it behaves the same
	assertEquals(result, value(run(only, "app.json")));
});

Deno.test("firstOf(): an empty list doesn't type-check", () => {
	// Given: nothing to try
	// When: firstOf([]) is written (never run)
	const misuse = (): void => {
		// @ts-expect-error: firstOf needs at least one recovery
		firstOf([]);
	};

	// Then: it is rejected at compile time
	assert(typeof misuse === "function");
});

Deno.test("retry(): runs again after each failure, up to times more", () => {
	// Given: a recovery that fails twice, then succeeds
	const flaky = scripted<number, string>([Err("1"), Err("2"), Ok(3)]);

	// When: it is retried up to five more times
	const result = value(run(retry(flaky.recovery, { times: 5 }), "app.json"));

	// Then: it succeeded on its third run, and stopped there
	assertEquals(result, Some(Ok(3)));
	assertEquals(flaky.runs(), 3);
});

Deno.test("retry(): keeps the last error once retries run out", () => {
	// Given: a recovery that always fails with its run count
	let runs = 0;
	const failing = new Recovery((_: string) => {
		runs += 1;
		return resolved(Err<number, number>(runs));
	});

	// When: it is retried twice more
	const result = value(run(retry(failing, { times: 2 }), "app.json"));

	// Then: it ran three times, and the last error is the result
	assertEquals(runs, 3);
	assertEquals(result, Some(Err(3)));
});

Deno.test("retry(): times 0 runs the recovery once", () => {
	// Given: a recovery that always fails
	const failing = scripted<number, string>([Err("nope")]);

	// When: it is retried zero more times
	const result = value(run(retry(failing.recovery, { times: 0 }), "app.json"));

	// Then: it ran once
	assertEquals(result, Some(Err("nope")));
	assertEquals(failing.runs(), 1);
});

Deno.test("retry(): an async recovery runs again once each run settles", async () => {
	// Given: an async recovery that fails once, then succeeds
	const pending = [
		vowWithResolver<Result<number, string>>(),
		vowWithResolver<Result<number, string>>(),
	];
	let runs = 0;
	const remote = new Recovery((_: string) => {
		const next = pending[runs];
		runs += 1;
		if (next === undefined) throw new Error("too many runs");
		return next.vow;
	});
	const result = run(retry(remote, { times: 3 }), "app.json");

	// When: the first run fails, then the second succeeds
	const runsBefore = runs;
	pending[0]?.resolve(Err("offline"));
	const runsBetween = runs;
	pending[1]?.resolve(Ok(9000));

	// Then: each run started only after the last settled
	assertEquals([runsBefore, runsBetween], [1, 2]);
	assertEquals(await wait(result), Ok(9000));
});

Deno.test("retry(): times must be a non-negative integer", () => {
	// Given: a recovery
	const recovery = succeed<string, number>(1);

	// When: retry is given a bad count
	// Then: it panics at once
	for (const times of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		assertThrows(
			() => retry(recovery, { times }),
			Panic,
			"non-negative integer",
		);
	}
});

Deno.test("when(): runs the recovery only for values that pass the test", () => {
	// Given: a guarded, counting recovery
	const guarded = scripted<number, string>([Ok(3000)]);
	const devDefault = when(guarded.recovery, {
		test: (path) => path.startsWith("dev"),
		otherwise: "not a dev config",
	});

	// When: it is run on a passing and a failing value
	const dev = value(run(devDefault, "dev.json"));
	const app = value(run(devDefault, "app.json"));

	// Then: the passing one ran it, the other failed at once without running it
	assertEquals(dev, Some(Ok(3000)));
	assertEquals(app, Some(Err("not a dev config")));
	assertEquals(guarded.runs(), 1);
});

Deno.test("when(): a failure of the recovery itself passes through", () => {
	// Given: a guarded recovery that fails
	const guarded = when(fail<string, number>(404), {
		test: () => true,
		otherwise: "skipped",
	});

	// When: it is run on a passing value
	const result = value(run(guarded, "app.json"));

	// Then: its own error is the result
	assertEquals(result, Some(Err(404)));
});

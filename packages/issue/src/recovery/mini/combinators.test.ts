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

interface Config {
	readonly port: number;
}

Deno.test("orElse() and firstOf() take the wider residue, with no union", () => {
	// Given: a fail (residue never) and a recovery yielding a Config
	const readBackup = fail<string, string>("no backup");
	const useDefault = succeed<string, Config>({ port: 8080 });

	// When: they are composed in either order, with no annotation
	const backupFirst = orElse(readBackup, useDefault);
	const defaultFirst = orElse(useDefault, readBackup);
	const listed = firstOf([readBackup, useDefault]);

	// Then: each is a Config recovery, and runs to the default
	const asConfig: Recovery<string, Config, never> = backupFirst;
	const asConfigToo: Recovery<string, Config, string> = defaultFirst;
	const asConfigListed: Recovery<string, Config, string> = listed;
	assertEquals(value(run(asConfig, "app.json")), Some(Ok({ port: 8080 })));
	assertEquals(value(run(asConfigToo, "app.json")), Some(Ok({ port: 8080 })));
	assertEquals(
		value(run(asConfigListed, "app.json")),
		Some(Ok({ port: 8080 })),
	);
});

Deno.test("orElse() and firstOf() reject unrelated residues", () => {
	// Given: recoveries yielding a number and a Config
	const asNumber = succeed<string, number>(8080);
	const asConfig = succeed<string, Config>({ port: 8080 });

	// When: composing them is written (never run)
	const misuses = (): void => {
		// @ts-expect-error: number and Config have no wider residue but a union
		orElse(asNumber, asConfig);
		// @ts-expect-error: the same holds across firstOf's list
		firstOf([asNumber, asConfig]);
	};

	// Then: it doesn't type-check
	assert(typeof misuses === "function");
});

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

/** A recovery that fails with its run count, settling on a later microtask. */
function laterFailing(): {
	recovery: Recovery<string, number, number>;
	runs: () => number;
} {
	let count = 0;
	const recovery = new Recovery((_: string) => {
		count += 1;
		const failure = count;
		const { vow, resolve } = vowWithResolver<Result<number, number>>();
		queueMicrotask(() => resolve(Err(failure)));
		return vow;
	});
	return { recovery, runs: () => count };
}

Deno.test("retry(): many sync retries loop without overflowing the stack", () => {
	// Given: a sync recovery that always fails with its run count
	let runs = 0;
	const failing = sync((_: string) => {
		runs += 1;
		return Err<number, number>(runs);
	});

	// When: it is retried ten thousand more times
	const result = value(run(retry(failing, { times: 10_000 }), "app.json"));

	// Then: it ran every time, settled at once, and kept the last error
	assertEquals(runs, 10_001);
	assertEquals(result, Some(Err(10_001)));
});

Deno.test("retry(): many async retries settle without nesting the stack", async () => {
	// Given: an async recovery that always fails with its run count
	const failing = laterFailing();

	// When: it is retried ten thousand more times
	const result = await wait(
		run(retry(failing.recovery, { times: 10_000 }), "app.json"),
	);

	// Then: it ran every time, and kept the last error
	assertEquals(failing.runs(), 10_001);
	assertEquals(result, Err(10_001));
});

Deno.test("firstOf(): a long sync list loops without overflowing the stack", () => {
	// Given: twenty thousand and one failing recoveries, then one that succeeds
	const failures: Recovery<string, number, number>[] = Array.from(
		{ length: 20_000 },
		(_, index) => fail(index),
	);
	const recovery = firstOf<string, number, number>([
		fail(-2),
		...failures,
		succeed(-1),
	]);

	// When: it is run
	const result = value(run(recovery, "app.json"));

	// Then: it reached the success at the end, at once
	assertEquals(result, Some(Ok(-1)));
});

Deno.test("firstOf(): a long async list settles without nesting the stack", async () => {
	// Given: ten thousand async recoveries that all fail
	const failing = laterFailing();
	const recovery = firstOf([
		failing.recovery,
		...Array.from({ length: 9_999 }, () => failing.recovery),
	]);

	// When: it is run
	const result = await wait(run(recovery, "app.json"));

	// Then: each ran in turn, and the last error is the result
	assertEquals(failing.runs(), 10_000);
	assertEquals(result, Err(10_000));
});

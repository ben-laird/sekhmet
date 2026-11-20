/**
 * Exercises `@sekhmet/lifetime`: a tree of lifetimes torn down in reverse
 * acquisition order, a cleanup's throw kept in the report, a child with its
 * own cause, and `await using`.
 *
 * @module
 */

import { isolate, union } from "@sekhmet/enum/core/mini";
import { isErr, unwrapErr } from "@sekhmet/enum/result/mini";
import { Lifetime } from "@sekhmet/lifetime";
import { definePanicRuntime } from "@sekhmet/panic";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	const panics = definePanicRuntime();
	const reported: unknown[] = [];
	panics.setHook(({ payload }) => {
		reported.push(payload);
	});

	const order: string[] = [];
	const app = new Lifetime<undefined, string>({ value: undefined, panics });
	app.defer(() => {
		order.push("cleanup 1");
	});
	app.child({ value: "a" }).defer((cause) => {
		order.push(`child a: ${cause}`);
	});
	app.defer(() => {
		throw new Error("cleanup bug");
	});
	const request = app.child({
		value: "/",
		fromParent: (cause) => cause.length,
	});
	const forFetch = request.ending.toAbortSignal();

	const polled = app.end("done").poll();
	let failures = 0;
	if (isolate(polled, "Ready")) {
		const report = union(polled);
		if (isErr(report)) {
			failures = unwrapErr(report).panics.length;
		}
	}
	expectEqual({
		label: "reverse acquisition order",
		actual: order,
		expected: ["child a: done", "cleanup 1"],
	});
	expectEqual({
		label: "a throwing cleanup is in the report",
		actual: [failures, reported.length],
		expected: [1, 1],
	});
	expectEqual({
		label: "a child's own cause, through toAbortSignal",
		actual: forFetch.reason,
		expected: 4,
	});

	let closed = false;
	{
		await using db = new Lifetime<undefined, string>({
			value: undefined,
			panics,
			disposeCause: "scope exited",
		});
		db.defer(async () => {
			await Promise.resolve();
			closed = true;
		});
	}
	expectEqual({ label: "await using", actual: closed, expected: true });
}

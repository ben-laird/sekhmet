/**
 * Exercises `@sekhmet/dispatch`: a typed dispatch where the first wins, a
 * throwing listener isolated by the panic runtime, a derived signal, and the
 * bridges to `AbortSignal`, promises and vows.
 *
 * @module
 */

import { DispatchController, DispatchSignal } from "@sekhmet/dispatch";
import { isolate, union } from "@sekhmet/enum/core/mini";
import { unwrapOr } from "@sekhmet/enum/option/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import { isResolved } from "@sekhmet/vow/mini";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	const runtime = definePanicRuntime();
	const reported: unknown[] = [];
	runtime.setHook(({ payload }) => {
		reported.push(payload);
	});

	const cancel = new DispatchController<string>({ panics: runtime });
	const heard: string[] = [];
	cancel.signal.whenDispatched(() => {
		throw new Error("listener bug");
	});
	cancel.signal.whenDispatched((reason) => {
		heard.push(reason);
	});
	const label = cancel.signal.map((reason) => `stopped: ${reason}`);
	const forFetch = cancel.signal.toAbortSignal();
	const vow = cancel.signal.toVow();
	const waiting = cancel.signal.wait();

	cancel.dispatch("user");
	const second = cancel.dispatch("timeout");
	expectEqual({
		label: "the first dispatch wins",
		actual: [heard, unwrapOr(second, "none")],
		expected: [["user"], "user"],
	});
	expectEqual({
		label: "a throwing listener is reported",
		actual: reported.length,
		expected: 1,
	});
	const mapped = label.poll();
	expectEqual({
		label: "map",
		actual: isolate(mapped, "Ready") ? union(mapped) : "pending",
		expected: "stopped: user",
	});
	expectEqual({
		label: "toAbortSignal",
		actual: [forFetch.aborted, forFetch.reason],
		expected: [true, "user"],
	});
	expectEqual({ label: "toVow", actual: isResolved(vow), expected: true });
	expectEqual({ label: "wait", actual: await waiting, expected: "user" });

	const platform = new AbortController();
	const closed = DispatchSignal.fromAbortSignal({
		signal: platform.signal,
		panics: runtime,
	});
	const either = DispatchSignal.any([closed, DispatchSignal.never()]);
	const reason = either.wait();
	platform.abort("socket closed");
	expectEqual({
		label: "fromAbortSignal and any",
		actual: await reason,
		expected: "socket closed",
	});
}

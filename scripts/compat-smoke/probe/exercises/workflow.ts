/**
 * Exercises `@sekhmet/workflow`: each helper panics through a panic runtime,
 * and its guard recognizes the payload, through the root and the subpaths.
 *
 * @module
 */

import { unwrapErr } from "@sekhmet/enum/result/mini/unwrap";
import { definePanicRuntime } from "@sekhmet/panic";
import { isTodoPanic, todo } from "@sekhmet/workflow";
import { invariant, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { isUnimplementedPanic, unimplemented } from "@sekhmet/workflow/todo";
import {
	isUnreachablePanic,
	unreachable,
} from "@sekhmet/workflow/unreachable/unreachable";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export function exercise(): void {
	const runtime = definePanicRuntime();
	const reported: string[] = [];
	runtime.setHook(({ payload }) => {
		reported.push(payload instanceof Error ? payload.name : "?");
	});

	const fromTodo = unwrapErr(
		runtime.catchUnwind(() => {
			return todo({
				description: "export to CSV",
				subtasks: [{ description: "escape quotes", complete: true }],
			});
		}),
	);
	expectEqual({
		label: "todo panics with its checklist",
		actual: [
			isTodoPanic(fromTodo),
			fromTodo instanceof Error ? fromTodo.message : undefined,
		],
		expected: [
			true,
			"a code path that is not implemented yet was executed\nTodo: export to CSV\n  - [x] escape quotes",
		],
	});

	const fromUnimplemented = unwrapErr(
		runtime.catchUnwind(() => unimplemented()),
	);
	const cyclic: Record<string, unknown> = { big: 1n };
	cyclic.self = cyclic;
	const untyped = JSON.parse("null") ?? cyclic;
	const fromUnreachable = unwrapErr(
		runtime.catchUnwind(() => {
			const flag: true = untyped;
			if (flag === true) return;
			unreachable({ value: flag });
		}),
	);
	const fromInvariant = unwrapErr(
		runtime.catchUnwind(() => {
			invariant(false, { expectedBehavior: "false should be true" });
		}),
	);
	expectEqual({
		label: "each guard recognizes its own helper",
		actual: [
			isUnimplementedPanic(fromUnimplemented),
			isUnreachablePanic(fromUnreachable),
			isInvariantPanic(fromInvariant),
			isTodoPanic(fromInvariant),
		],
		expected: [true, true, true, false],
	});
	expectEqual({
		label: "unreachable renders a cyclic BigInt value",
		actual:
			fromUnreachable instanceof Error
				? fromUnreachable.message.split("\n")[1]
				: undefined,
		expected: "Impossible value: { big: 1n, self: [Circular] }",
	});
	expectEqual({
		label: "the hook saw every panic by name",
		actual: reported,
		expected: [
			"Panic (Todo)",
			"Panic (Unimplemented)",
			"Panic (Unreachable)",
			"Panic (Invariant)",
		],
	});
}

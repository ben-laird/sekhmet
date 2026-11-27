/**
 * Exercises `@sekhmet/workflow`: each helper panics through a panic runtime,
 * whose boundary settles sync work at once, and its guard recognizes the
 * payload, through the root and the subpaths.
 * The 0.2.0 checks `defined`, `satisfies` and `invariantEqual` pass on good
 * values and panic with their own `cause.check.kind` on bad ones.
 *
 * @module
 */

import { expectReady } from "@sekhmet/enum/poll/mini";
import { definePanicRuntime } from "@sekhmet/panic";
import type { Outcome } from "@sekhmet/panic/outcome/mini/core";
import { unwrapPanicked } from "@sekhmet/panic/outcome/mini/panic";
import { isOk } from "@sekhmet/panic/outcome/mini/predicates";
import { unwrap } from "@sekhmet/panic/outcome/mini/unwrap";
import { poll } from "@sekhmet/vow/mini";
import { isTodoPanic, todo } from "@sekhmet/workflow";
import { invariant, isInvariantPanic } from "@sekhmet/workflow/invariant";
import { defined } from "@sekhmet/workflow/invariant/defined";
import { invariantEqual } from "@sekhmet/workflow/invariant/invariant-equal";
import { satisfies } from "@sekhmet/workflow/invariant/satisfies";
import { isUnimplementedPanic, unimplemented } from "@sekhmet/workflow/todo";
import {
	isUnreachablePanic,
	unreachable,
} from "@sekhmet/workflow/unreachable/unreachable";
import { expectEqual } from "../check.ts";

function checkKind(payload: unknown): string | undefined {
	return isInvariantPanic(payload) ? payload.cause.check.kind : undefined;
}

function exerciseChecks(): void {
	const runtime = definePanicRuntime();
	// Sync work settles the boundary's vow before catchUnwind returns
	const catchNow = <T>(work: () => T): Outcome<T, never, unknown> => {
		return expectReady(poll(runtime.catchUnwind(work)), "sync work");
	};
	runtime.setHook(() => {});
	const absent: string | null = JSON.parse("null");
	expectEqual({
		label: "defined returns a present value and keeps 0",
		actual: unwrap(
			catchNow(() => {
				return [
					defined("Ada", { expectedBehavior: "a name is set" }),
					defined(0, { expectedBehavior: "a count is set" }),
				];
			}),
		),
		expected: ["Ada", 0],
	});
	const fromDefined = unwrapPanicked(
		catchNow(() => {
			return defined(absent, { expectedBehavior: "a name is set" });
		}),
	);

	const isEven = (n: number): boolean => {
		return n % 2 === 0;
	};
	expectEqual({
		label: "satisfies returns an accepted value",
		actual: unwrap(
			catchNow(() => {
				return satisfies(4, { predicate: isEven, expectedBehavior: "even" });
			}),
		),
		expected: 4,
	});
	const fromSatisfies = unwrapPanicked(
		catchNow(() => {
			return satisfies(3, { predicate: isEven, expectedBehavior: "even" });
		}),
	);

	const passedEqual = catchNow(() => {
		invariantEqual({
			actual: Number.NaN,
			expected: Number.NaN,
			expectedBehavior: "NaN is itself by Object.is",
		});
	});
	const fromEqual = unwrapPanicked(
		catchNow(() => {
			invariantEqual({ actual: 1, expected: 2, expectedBehavior: "1 is 2" });
		}),
	);
	expectEqual({
		label: "each check panics with its own kind",
		actual: [
			isOk(passedEqual),
			checkKind(fromDefined),
			checkKind(fromSatisfies),
			checkKind(fromEqual),
		],
		expected: [true, "defined", "satisfies", "equal"],
	});
}

/** Runs the exercise. */
export function exercise(): void {
	const runtime = definePanicRuntime();
	// Sync work settles the boundary's vow before catchUnwind returns
	const catchNow = <T>(work: () => T): Outcome<T, never, unknown> => {
		return expectReady(poll(runtime.catchUnwind(work)), "sync work");
	};
	const reported: string[] = [];
	runtime.setHook(({ payload }) => {
		reported.push(payload instanceof Error ? payload.name : "?");
	});

	const fromTodo = unwrapPanicked(
		catchNow(() => {
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

	const fromUnimplemented = unwrapPanicked(catchNow(() => unimplemented()));
	const cyclic: Record<string, unknown> = { big: 1n };
	cyclic.self = cyclic;
	const untyped = JSON.parse("null") ?? cyclic;
	const fromUnreachable = unwrapPanicked(
		catchNow(() => {
			const flag: true = untyped;
			if (flag === true) return;
			unreachable({ value: flag });
		}),
	);
	const fromInvariant = unwrapPanicked(
		catchNow(() => {
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

	exerciseChecks();
}

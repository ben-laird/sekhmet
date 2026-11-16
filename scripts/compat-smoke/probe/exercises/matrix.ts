/**
 * Exercises `@sekhmet/matrix`: the same product through root and mini.
 *
 * @module
 */

import { matrix } from "@sekhmet/matrix";
import { matrix as miniMatrix } from "@sekhmet/matrix/mini/core";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export function exercise(): void {
	const definition = { method: ["GET", "POST"], authenticated: [true, false] };
	const expected = [
		{ method: "GET", authenticated: true },
		{ method: "GET", authenticated: false },
		{ method: "POST", authenticated: true },
		{ method: "POST", authenticated: false },
	];

	expectEqual({ label: "root matrix", actual: matrix(definition), expected });
	expectEqual({
		label: "mini matrix",
		actual: miniMatrix(definition),
		expected,
	});
	expectEqual({
		label: "empty axis",
		actual: matrix({ a: [1, 2], b: [] }),
		expected: [],
	});
}

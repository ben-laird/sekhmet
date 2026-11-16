/**
 * The {@linkcode matrix} function and its {@linkcode Matrix} and {@linkcode MatrixCase} types.
 *
 * @module
 */

/**
 * A test case represented as a record of string keys to unknown values.
 */
export type MatrixCase = Record<string, unknown>;

/**
 * A matrix definition where each key maps to an array of possible values.
 *
 * @template T The shape of the resulting test cases
 */
export type Matrix<T extends MatrixCase> = {
	[K in keyof T]: T[K][];
};

/**
 * Generates all combinations of test cases from a matrix definition.
 *
 * This is useful for creating parameterized tests that need to cover
 * multiple combinations of input values. The function computes the
 * Cartesian product of all value arrays.
 *
 * @template T The shape of the resulting test cases
 * @param definition A record where each key maps to an array of possible values
 * @returns An array of all possible combinations
 *
 * @example
 * ```ts
 * import { matrix } from "@sekhmet/matrix";
 * import { assertEquals } from "@std/assert";
 *
 * const cases = matrix({
 *   browser: ["chrome", "firefox", "safari"],
 *   viewport: ["mobile", "desktop"],
 *   theme: ["light", "dark"],
 * });
 *
 * // 12 cases (3 * 2 * 2); the first key varies slowest
 * assertEquals(cases.length, 12);
 * assertEquals(cases.slice(0, 3), [
 *   { browser: "chrome", viewport: "mobile", theme: "light" },
 *   { browser: "chrome", viewport: "mobile", theme: "dark" },
 *   { browser: "chrome", viewport: "desktop", theme: "light" },
 * ]);
 *
 * // In a test file, register one test per case:
 * // for (const { browser, viewport, theme } of cases) {
 * //   Deno.test(`${browser} - ${viewport} - ${theme}`, () => { ... });
 * // }
 * ```
 */
export function matrix<T extends MatrixCase>(definition: Matrix<T>): T[] {
	let result: T[] = [Object.create(null) as T];

	for (const [key, values] of Object.entries(definition)) {
		const newResult: T[] = [];

		for (const existingCase of result) {
			for (const value of values) {
				newResult.push({ ...existingCase, [key]: value } as T);
			}
		}

		result = newResult;
	}

	return result;
}

/**
 * The exercises' one assertion. The probe runs in runtimes where `@std/assert`
 * is not installed, so it carries its own.
 *
 * @module
 */

/**
 * Asserts that two values serialize to the same JSON, the way a test
 * assertion does: it throws, and the probe records the failure.
 *
 * @param params - What was observed, what was expected and what it is
 */
export function expectEqual({
	actual,
	expected,
	label,
}: {
	actual: unknown;
	expected: unknown;
	label: string;
}): void {
	const seen = JSON.stringify(actual);
	const wanted = JSON.stringify(expected);
	if (seen !== wanted) {
		throw new Error(`${label}: expected ${wanted}, got ${seen}`);
	}
}

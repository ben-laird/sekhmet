// deno-coverage-ignore-file
import type { RanStepResult, StepResult } from "./types.ts";

/**
 * Test helper: narrows a step result to one whose command ran, panicking
 * otherwise so the test fails with the unexpected result.
 *
 * @param result - The step result under test
 * @returns The same result, narrowed to a ran step
 */
export function ranResult(result: StepResult | undefined): RanStepResult {
	if (result?.status === "passed" || result?.status === "failed") {
		return result;
	}
	throw new Error(`Expected a ran step, got ${JSON.stringify(result)}`);
}

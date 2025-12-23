import { cyan, gray, green, red } from "@std/fmt/colors";
import { shouldShowOutput } from "./step.ts";
import type { StepResult, WorkflowStep } from "./types.ts";

/**
 * Formats and displays workflow results to the console.
 * Returns the exit code to use (0 for success, specific code for first failure).
 */
export function formatWorkflowOutput(
	steps: WorkflowStep[],
	results: Map<string, StepResult>,
	decoder: TextDecoder,
): number {
	let exitCode = 0;

	for (const step of steps) {
		const result = results.get(step.name);
		if (!result) {
			throw new Error(`Step "${step.name}" did not complete`);
		}

		// Display status
		const statusSymbol = (() => {
			switch (result.status) {
				case "passed": {
					return green("[x]");
				}
				case "failed": {
					return red("[!]");
				}
				case "skipped": {
					return cyan("[ ]");
				}
			}
		})();

		console.log(`${statusSymbol} ${result.name}`);

		// Show output if configured
		if (result.output && shouldShowOutput(step, result.status)) {
			console.group();

			const stderr = decoder.decode(result.output.stderr);
			if (stderr) console.error(stderr);

			const stdout = decoder.decode(result.output.stdout);
			if (stdout) console.log(stdout);

			console.groupEnd();
		}

		// Show captured outputs
		if (result.outputs?.env && Object.keys(result.outputs.env).length > 0) {
			console.log(
				`  ${gray("Exported:")} ${Object.keys(result.outputs.env).join(", ")}`,
			);
		}

		// Track first failure's exit code
		if (result.status === "failed" && exitCode === 0) {
			exitCode = step.exitCode ?? 1;
		}
	}

	return exitCode;
}

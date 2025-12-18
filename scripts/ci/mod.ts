import { bold, cyan, green, red } from "@std/fmt/colors";

export interface CICheck {
	name: string;
	command: Deno.Command;
	showIO?: boolean | ((status: CICheckResult["status"]) => boolean) | undefined;
	skip?: boolean | (() => boolean) | undefined;
}

export type CICheckResult =
	| { status: "passed"; output: Deno.CommandOutput }
	| { status: "failed"; output: Deno.CommandOutput }
	| { status: "skipped" };
// {}

interface CICheckResultInternal {
	check: CICheck;
	result: CICheckResult;
}

export async function runCIChecks(checks: CICheck[]): Promise<void> {
	console.log(cyan(bold("Running CI checks...\n")));

	const results = await Promise.all(
		checks.map(async (check): Promise<CICheckResultInternal> => {
			const shouldSkip = (() => {
				if (typeof check.skip === "function") {
					return check.skip();
				}
				return check.skip ?? false;
			})();

			if (shouldSkip) {
				return { check, result: { status: "skipped" } };
			}

			const output = await check.command.output();

			if (output.success) {
				return { check, result: { status: "passed", output } };
			}

			return { check, result: { status: "failed", output } };
		}),
	);

	let failed = false;

	for (const { check, result } of results) {
		switch (result.status) {
			case "skipped": {
				console.log(cyan(`⊘ ${check.name} skipped`));
				break;
			}
			case "passed": {
				console.log(green(`✓ ${check.name} passed`));
				break;
			}
			case "failed": {
				console.error(red(`✗ ${check.name} failed`));
				failed = true;
				break;
			}
		}

		if (result.status === "skipped") {
			continue;
		}

		// At this point, TypeScript knows result is either "passed" or "failed"
		// and both have the output property
		const status = result.status;
		const show = (() => {
			if (typeof check.showIO === "function") {
				return check.showIO(status);
			}

			return check.showIO ?? status === "failed";
		})();

		if (show) {
			const decoder = new TextDecoder();
			const { output } = result;
			if (output.stderr.length > 0) {
				console.error(decoder.decode(output.stderr));
			}
			if (output.stdout.length > 0) {
				console.log(decoder.decode(output.stdout));
			}
		}
	}

	if (failed) {
		console.error(red(bold("\nCI checks failed")));
		Deno.exit(1);
	} else {
		console.log(green(bold("\nAll CI checks passed")));
	}
}

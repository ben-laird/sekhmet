import { bold, cyan, green, red } from "@std/fmt/colors";

export interface CICheck {
	name: string;
	command: Deno.Command;
}

export async function runCIChecks(checks: CICheck[]): Promise<void> {
	console.log(cyan(bold("Running CI checks...\n")));

	const results = await Promise.all(
		checks.map(async (check) => {
			const output = await check.command.output();
			return { check, output };
		}),
	);

	let failed = false;

	for (const { check, output } of results) {
		if (output.success) {
			console.log(green(`✓ ${check.name} passed`));
		} else {
			console.error(red(`✗ ${check.name} failed`));
			const decoder = new TextDecoder();
			if (output.stderr.length > 0) {
				console.error(decoder.decode(output.stderr));
			}
			if (output.stdout.length > 0) {
				console.log(decoder.decode(output.stdout));
			}
			failed = true;
		}
	}

	if (failed) {
		console.error(red(bold("\nCI checks failed")));
		Deno.exit(1);
	} else {
		console.log(green(bold("\nAll CI checks passed")));
	}
}

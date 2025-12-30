import { parseArgs } from "@std/cli";
import { bold, green, red, yellow } from "@std/fmt/colors";
import { createWorkspace } from "@/mod.ts";

/**
 * Main entry point for the workspace creation CLI.
 * Parses command-line arguments and creates a new workspace from a template.
 *
 * @throws {Error} If template or destination arguments are missing
 * @throws {Error} If the script directory cannot be determined
 * @throws {Error} If workspace creation fails
 */
export async function main(): Promise<void> {
	const { template, destination } = parseArgs(Deno.args, {
		string: ["template", "destination"],
		alias: {
			t: "template",
			d: "destination",
		},
	});

	if (!template || !destination) {
		console.error(
			red(
				"Usage: deno run main.ts --template <template-name> --destination <path>",
			),
		);
		console.error(red("  or:  deno run main.ts -t <template-name> -d <path>"));
		Deno.exit(1);
	}

	const scriptDir = import.meta.dirname;
	if (!scriptDir) {
		console.error(red("Error: Unable to determine script directory"));
		Deno.exit(1);
	}

	try {
		const destPath = destination.endsWith("/")
			? destination
			: `${destination}/`;
		await createWorkspace({
			template,
			destination: new URL(destPath, `file://${Deno.cwd()}/`),
			templateBaseDir: new URL("templates/", import.meta.url),
		});
		console.log(
			green(
				`✓ Created workspace from template ${bold(yellow(template))} at ${bold(
					destination,
				)}`,
			),
		);
	} catch (error) {
		console.error(
			red(`Error: ${error instanceof Error ? error.message : error}`),
		);
		Deno.exit(1);
	}
}

if (import.meta.main) {
	await main();
}

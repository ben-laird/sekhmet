import { runCIChecks } from "@/mod.ts";

export async function main(): Promise<void> {
	const isCI = Deno.env.get("CI") === "true";

	await runCIChecks([
		{
			name: "Deno Lint",
			command: new Deno.Command("deno", {
				args: ["lint"],
			}),
		},
		{
			name: "Biome Check",
			command: new Deno.Command("deno", {
				args: ["run", "--allow-env", "@biomejs/biome", "ci"],
			}),
		},
		{
			name: "Deno Test",
			showIO: ({ passed }) => isCI && !passed,
			command: new Deno.Command("deno", {
				args: ["test", "--parallel", "--coverage"],
			}),
		},
	]);
}

if (import.meta.main) {
	await main();
}

import { runCIChecks } from "@/mod.ts";

export async function main(): Promise<void> {
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
				args: ["run", "--allow-env", "npm:@biomejs/biome", "ci", "."],
			}),
		},
		{
			name: "Deno Test",
			command: new Deno.Command("deno", {
				args: ["test", "--parallel", "--coverage"],
			}),
		},
	]);
}

if (import.meta.main) {
	await main();
}

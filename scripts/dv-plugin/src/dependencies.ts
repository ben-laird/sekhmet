import { Err, Ok, type Result } from "@sekhmet/enum/result";
import { isAbsolute, relative } from "@std/path";
import { z } from "zod";
import { packageNameOf } from "./specifier.ts";

/**
 * The slice of `deno info --json` output the plugin reads: every module in the
 * graph, with its on-disk location and the raw specifiers it imports.
 */
export interface ModuleGraph {
	/** Every module reachable from the root. */
	modules: GraphModule[];
}

/**
 * One module in a {@linkcode ModuleGraph}.
 */
export interface GraphModule {
	/** Absolute path on disk; absent for remote or unresolved modules. */
	local?: string | undefined;
	/** The module's imports, as written in its source. */
	dependencies?: { specifier: string }[] | undefined;
}

const moduleGraphSchema: z.ZodType<ModuleGraph> = z.object({
	modules: z.array(
		z.object({
			local: z.string().optional(),
			dependencies: z.array(z.object({ specifier: z.string() })).optional(),
		}),
	),
});

/**
 * Validates parsed `deno info --json` output.
 *
 * @param value The parsed JSON.
 * @returns The module graph, or a description of what did not match.
 */
export function parseModuleGraph(value: unknown): Result<ModuleGraph, string> {
	const parsed = moduleGraphSchema.safeParse(value);
	return parsed.success ? Ok(parsed.data) : Err(z.prettifyError(parsed.error));
}

function isInside({
	directory,
	path,
}: {
	directory: string;
	path: string;
}): boolean {
	const fromDirectory = relative(directory, path);
	return !fromDirectory.startsWith("..") && !isAbsolute(fromDirectory);
}

/**
 * Finds the workspace packages a package imports.
 *
 * Sekhmet packages import each other through bare `@sekhmet/<pkg>` specifiers
 * that the workspace resolves, so their manifests list no such dependency.
 * The module graph of the package's entry points is the real source: only
 * modules inside the package count, so a dependency's own imports are not
 * attributed to it.
 *
 * @param args.graphs Module graphs of the package's entry points.
 * @param args.packageDirectory Absolute path of the package.
 * @param args.candidates Names of the other packages dv discovered.
 * @returns The sorted subset of `candidates` the package imports.
 */
export function workspaceDependencies({
	graphs,
	packageDirectory,
	candidates,
}: {
	graphs: readonly ModuleGraph[];
	packageDirectory: string;
	candidates: readonly string[];
}): string[] {
	const candidateSet = new Set(candidates);
	const found = new Set<string>();
	for (const graph of graphs) {
		for (const module of graph.modules) {
			if (module.local === undefined) continue;
			if (!isInside({ directory: packageDirectory, path: module.local })) {
				continue;
			}
			for (const { specifier } of module.dependencies ?? []) {
				const name = packageNameOf(specifier);
				if (name !== undefined && candidateSet.has(name)) found.add(name);
			}
		}
	}
	return [...found].sort();
}

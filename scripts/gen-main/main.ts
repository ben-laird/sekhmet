// deno-coverage-ignore-file
/**
 * CLI for generating main entrypoints from mini barrels.
 *
 * - `deno task gen:main` regenerates every main module in place.
 * - `deno task gen:main --check` regenerates in memory and exits non-zero,
 *   listing every file that differs from what is checked in.
 *
 * @module
 */

import { parseArgs } from "@std/cli";
import {
	type DocModules,
	decodeDocJson,
	FEATURES,
	type Feature,
	generateMain,
	isClassFeature,
	isStale,
} from "@/mod.ts";

const ROOT = new URL("../../", import.meta.url);
const decoder = new TextDecoder();

/** The ways the CLI can fail. */
type CliError =
	| { kind: "command"; command: string; stderr: string }
	| { kind: "decode"; path: string; message: string }
	| {
			kind: "generate";
			entrypoint: string;
			symbol: string | undefined;
			message: string;
	  };

type Outcome<T> = { ok: true; value: T } | { ok: false; error: CliError };

async function run({
	command,
	args,
	stdin,
}: {
	command: string;
	args: string[];
	stdin?: string;
}): Promise<Outcome<string>> {
	const child = new Deno.Command(command, {
		args,
		cwd: ROOT,
		stdin: stdin === undefined ? "null" : "piped",
		stdout: "piped",
		stderr: "piped",
	}).spawn();

	if (stdin !== undefined) {
		const writer = child.stdin.getWriter();
		await writer.write(new TextEncoder().encode(stdin));
		await writer.close();
	}

	const { success, stdout, stderr } = await child.output();
	if (!success) {
		return {
			ok: false,
			error: {
				kind: "command",
				command: [command, ...args].join(" "),
				stderr: decoder.decode(stderr),
			},
		};
	}

	return { ok: true, value: decoder.decode(stdout) };
}

async function documentMinis(
	features: readonly Feature[],
): Promise<Outcome<DocModules>> {
	const minis = new Set(
		features.flatMap((feature) => [
			feature.mini,
			...(isClassFeature(feature) ? (feature.borrows ?? []) : []).map(
				(borrow) => borrow.mini,
			),
		]),
	);
	const output = await run({
		command: "deno",
		args: ["doc", "--json", ...minis],
	});
	if (!output.ok) return output;

	const decoded = decodeDocJson(JSON.parse(output.value));
	if (!decoded.ok) return decoded;

	return decoded;
}

async function readSources(
	modules: DocModules,
): Promise<ReadonlyMap<string, string>> {
	const files = new Set<string>();
	for (const symbols of modules.values()) {
		for (const symbol of symbols) {
			for (const declaration of symbol.declarations) {
				if (declaration.kind !== "other") {
					files.add(declaration.location.filename);
				}
			}
		}
	}

	const entries = await Promise.all(
		[...files].map(
			async (file) => [file, await Deno.readTextFile(new URL(file))] as const,
		),
	);

	return new Map(entries);
}

async function readIfExists(url: URL): Promise<string | undefined> {
	try {
		return await Deno.readTextFile(url);
	} catch (error: unknown) {
		if (error instanceof Deno.errors.NotFound) return undefined;
		throw error;
	}
}

async function generateFeature({
	feature,
	modules,
	sources,
}: {
	feature: Feature;
	modules: DocModules;
	sources: ReadonlyMap<string, string>;
}): Promise<Outcome<string>> {
	const miniUrl = new URL(feature.mini, ROOT).href;
	const outputUrl = new URL(feature.output, ROOT).href;

	const borrowed = (isClassFeature(feature) ? (feature.borrows ?? []) : []).map(
		(borrow) => {
			const url = new URL(borrow.mini, ROOT).href;
			return { borrow, url, symbols: modules.get(url) ?? [] };
		},
	);

	const generated = generateMain({
		feature,
		symbols: modules.get(miniUrl) ?? [],
		sources,
		miniUrl,
		outputUrl,
		borrowed,
	});
	if (!generated.ok) return generated;

	return await run({
		command: "deno",
		args: [
			"run",
			"--no-prompt",
			"--allow-env",
			"--allow-read",
			"--allow-run",
			"@biomejs/biome",
			"check",
			"--write",
			`--stdin-file-path=${feature.output}`,
		],
		stdin: generated.value,
	});
}

function describe(error: CliError): string {
	switch (error.kind) {
		case "command":
			return `\`${error.command}\` failed:\n${error.stderr}`;
		case "decode":
			return `could not read deno doc output at ${error.path}: ${error.message}`;
		case "generate":
			return `${error.entrypoint}${error.symbol === undefined ? "" : ` (${error.symbol})`}: ${error.message}`;
	}
}

/**
 * Generates (or, with `--check`, verifies) every configured main module.
 *
 * @param args - Command-line arguments
 * @returns The process exit code: 0 on success, 1 when `--check` finds stale
 *   files, 2 when generation fails
 */
export async function main(args: string[]): Promise<number> {
	const { check } = parseArgs(args, { boolean: ["check"] });

	const modules = await documentMinis(FEATURES);
	if (!modules.ok) {
		console.error(describe(modules.error));
		return 2;
	}
	const sources = await readSources(modules.value);

	const stale: string[] = [];
	for (const feature of FEATURES) {
		const generated = await generateFeature({
			feature,
			modules: modules.value,
			sources,
		});
		if (!generated.ok) {
			console.error(describe(generated.error));
			return 2;
		}

		const url = new URL(feature.output, ROOT);
		const current = await readIfExists(url);
		if (!isStale({ current, generated: generated.value })) continue;

		if (check) {
			stale.push(feature.output);
		} else {
			await Deno.mkdir(new URL(".", url), { recursive: true });
			await Deno.writeTextFile(url, generated.value);
			console.log(`wrote ${feature.output}`);
		}
	}

	if (stale.length > 0) {
		console.error(
			`Stale generated main modules (run \`deno task gen:main\`):\n${stale.map((file) => `  ${file}`).join("\n")}`,
		);
		return 1;
	}

	if (check) console.log("Generated main modules are up to date.");
	return 0;
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}

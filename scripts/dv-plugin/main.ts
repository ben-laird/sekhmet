/**
 * Entry point dv runs for every plugin op: `deno run -A
 * scripts/dv-plugin/main.ts <op>`. Prints one JSON response on stdout; logs go
 * to stderr.
 *
 * @module
 */

import { Err, Ok, type Result } from "@sekhmet/enum/result/mini";
import { expandGlob } from "@std/fs";
import { type Io, runOp } from "./src/ops.ts";
import { isOp } from "./src/protocol.ts";

function reason(caught: unknown): string {
	return caught instanceof Error ? caught.message : String(caught);
}

/**
 * The real effects: process environment, filesystem and subprocesses.
 *
 * Deno APIs throw on I/O failure; each one is caught here, at the edge, and
 * returned as a value.
 */
const denoIo: Io = {
	env: Deno.env.toObject(),
	readStdin: () => new Response(Deno.stdin.readable).text(),
	log: (text) => console.error(text),
	readTextFile: async (path) => {
		try {
			return Ok(await Deno.readTextFile(path));
		} catch (caught: unknown) {
			return Err(reason(caught));
		}
	},
	writeTextFile: async ({ path, text }) => {
		try {
			await Deno.writeTextFile(path, text);
			return Ok(undefined);
		} catch (caught: unknown) {
			return Err(reason(caught));
		}
	},
	run: async ({ command, args, cwd }) => {
		const decoder = new TextDecoder();
		try {
			const output = await new Deno.Command(command, {
				args: [...args],
				cwd,
				stdin: "null",
				stdout: "piped",
				stderr: "piped",
			}).output();
			const result: Result<
				{ code: number; stdout: string; stderr: string },
				string
			> = Ok({
				code: output.code,
				stdout: decoder.decode(output.stdout),
				stderr: decoder.decode(output.stderr),
			});
			return result;
		} catch (caught: unknown) {
			return Err(reason(caught));
		}
	},
	findFiles: async ({ root, glob }) => {
		const paths: string[] = [];
		for await (const entry of expandGlob(glob, { root, includeDirs: false })) {
			paths.push(entry.path);
		}
		return paths;
	},
};

if (import.meta.main) {
	const op = Deno.args[0];
	if (!isOp(op)) {
		console.error(`dv-plugin: unknown op '${op ?? "<missing>"}'`);
		console.log(JSON.stringify({ ok: false, error: `unknown op '${op}'` }));
		Deno.exit(2);
	}
	const { response, exitCode } = await runOp({ op, io: denoIo });
	console.log(JSON.stringify(response));
	Deno.exit(exitCode);
}

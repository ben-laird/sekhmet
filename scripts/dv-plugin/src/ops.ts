import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { dirname, join, relative, resolve } from "@std/path";
import {
	type ModuleGraph,
	parseModuleGraph,
	workspaceDependencies,
} from "./dependencies.ts";
import { describeJsonEditError } from "./json-edit.ts";
import {
	type DenoManifest,
	exportTargets,
	isReleasable,
	parseManifest,
	setVersion,
	updateDependency,
} from "./manifest.ts";
import {
	CONTRACT_VERSION,
	describePluginError,
	type Op,
	type PackageEnvironment,
	type PluginError,
	parseGetDependenciesPayload,
	parseStdin,
	parseUpdateDependencyPayload,
	readBaseEnvironment,
	readDiscoverEnvironment,
	readPackageEnvironment,
	readVersionedPackageEnvironment,
	SUPPORTED_OPS,
} from "./protocol.ts";
import { releaseResponse } from "./publish.ts";

/**
 * What a finished subprocess reported.
 */
export interface CommandOutput {
	/** The exit code. */
	code: number;
	/** Captured stdout. */
	stdout: string;
	/** Captured stderr. */
	stderr: string;
}

/**
 * The plugin's effects, passed in so the ops stay testable.
 */
export interface Io {
	/** The process environment. */
	env: Readonly<Record<string, string>>;
	/** Reads all of stdin. */
	readStdin: () => Promise<string>;
	/** Writes a line of human-readable log to stderr. */
	log: (text: string) => void;
	/** Reads a UTF-8 file; the error is a reason. */
	readTextFile: (path: string) => Promise<Result<string, string>>;
	/** Writes a UTF-8 file; the error is a reason. */
	writeTextFile: (args: {
		path: string;
		text: string;
	}) => Promise<Result<void, string>>;
	/** Runs a subprocess to completion; the error is a spawn failure. */
	run: (args: {
		command: string;
		args: readonly string[];
		cwd: string;
	}) => Promise<Result<CommandOutput, string>>;
	/** Lists absolute paths of files under `root` matching `glob`. */
	findFiles: (args: { root: string; glob: string }) => Promise<string[]>;
}

/**
 * The JSON to print on stdout and the exit code to end with.
 */
export interface OpOutcome {
	/** The response object dv parses. */
	response: Readonly<Record<string, unknown>>;
	/** `0` on success, non-zero on failure. */
	exitCode: number;
}

type OpResult = Promise<Result<Record<string, unknown>, PluginError>>;

const MANIFEST = "deno.json";

/**
 * Serves one dv op.
 *
 * @param args.op The op dv asked for.
 * @param args.io The plugin's effects.
 * @returns The response and exit code.
 */
export async function runOp({
	op,
	io,
}: {
	op: Op;
	io: Io;
}): Promise<OpOutcome> {
	const result = await dispatch({ op, io });
	if (isErr(result)) {
		const error = describePluginError(unwrapErr(result));
		io.log(`dv-plugin ${op}: ${error}`);
		return { response: { ok: false, error }, exitCode: 1 };
	}
	return { response: unwrap(result), exitCode: 0 };
}

function dispatch({ op, io }: { op: Op; io: Io }): OpResult {
	switch (op) {
		case "info":
			return Promise.resolve(Ok(info()));
		case "discover":
			return discover(io);
		case "read-version":
			return readVersion(io);
		case "write-version":
			return writeVersion(io);
		case "update-dependency":
			return runUpdateDependency(io);
		case "get-dependencies":
			return getDependencies(io);
		case "release":
			return release(io);
		case "finalize":
			return finalize(io);
	}
}

function info(): Record<string, unknown> {
	return {
		contractVersion: CONTRACT_VERSION,
		supportedOps: SUPPORTED_OPS,
		name: "sekhmet-jsr",
		version: "0.1.0",
	};
}

async function discover(io: Io): OpResult {
	const environment = readDiscoverEnvironment(io.env);
	if (isErr(environment)) return Err(unwrapErr(environment));
	const { DV_REPO_ROOT: root, DV_DISCOVER_GLOB: glob } = unwrap(environment);

	const manifestPaths = await io.findFiles({
		root,
		glob: `${glob.replace(/\/+$/, "")}/${MANIFEST}`,
	});
	const packages: { name: string; path: string }[] = [];
	for (const manifestPath of manifestPaths) {
		const manifest = await readManifest({ io, path: manifestPath });
		if (isErr(manifest)) return Err(unwrapErr(manifest));
		const { name } = unwrap(manifest);
		if (name === undefined || !isReleasable(unwrap(manifest))) continue;
		packages.push({ name, path: relative(root, dirname(manifestPath)) });
	}
	packages.sort((left, right) => left.path.localeCompare(right.path));
	return Ok({ packages });
}

async function readVersion(io: Io): OpResult {
	const target = await packageManifest(io);
	if (isErr(target)) return Err(unwrapErr(target));
	// No version means "unreleased"; dv treats 0.0.0 as Unstable.
	return Ok({ version: unwrap(target).manifest.version ?? "0.0.0" });
}

async function writeVersion(io: Io): OpResult {
	const environment = readVersionedPackageEnvironment(io.env);
	if (isErr(environment)) return Err(unwrapErr(environment));
	const { DV_NEW_VERSION: version } = unwrap(environment);
	const path = manifestPathOf(unwrap(environment));

	const text = await io.readTextFile(path);
	if (isErr(text)) {
		return Err({ kind: "unreadable-file", path, detail: unwrapErr(text) });
	}
	const edited = setVersion({ text: unwrap(text), version });
	if (isErr(edited)) {
		return Err({
			kind: "invalid-manifest",
			path,
			detail: describeJsonEditError(unwrapErr(edited)),
		});
	}
	return writeFile({ io, path, text: unwrap(edited), response: { ok: true } });
}

async function runUpdateDependency(io: Io): OpResult {
	const environment = readPackageEnvironment(io.env);
	if (isErr(environment)) return Err(unwrapErr(environment));
	const payload = parseUpdateDependencyPayload(await io.readStdin());
	if (isErr(payload)) return Err(unwrapErr(payload));
	const { dependency, new_version: version } = unwrap(payload);
	const path = manifestPathOf(unwrap(environment));

	const text = await io.readTextFile(path);
	if (isErr(text)) {
		return Err({ kind: "unreadable-file", path, detail: unwrapErr(text) });
	}
	const update = updateDependency({ text: unwrap(text), dependency, version });
	if (isErr(update)) {
		const error = unwrapErr(update);
		return Err({
			kind: "invalid-manifest",
			path,
			detail:
				error.kind === "invalid-shape"
					? error.detail
					: describeJsonEditError(error),
		});
	}
	const { text: edited, changed } = unwrap(update);
	if (!changed) return Ok({ ok: true, changed: false });
	return writeFile({
		io,
		path,
		text: edited,
		response: { ok: true, changed: true },
	});
}

async function getDependencies(io: Io): OpResult {
	const target = await packageManifest(io);
	if (isErr(target)) return Err(unwrapErr(target));
	const payload = parseGetDependenciesPayload(await io.readStdin());
	if (isErr(payload)) return Err(unwrapErr(payload));
	const { candidates } = unwrap(payload);
	const { manifest, directory } = unwrap(target);
	if (candidates.length === 0) return Ok({ ok: true, dependencies: [] });

	const graphs: ModuleGraph[] = [];
	for (const entry of exportTargets(manifest)) {
		const output = await succeed({
			io,
			command: "deno",
			args: ["info", "--json", resolve(directory, entry)],
			cwd: directory,
		});
		if (isErr(output)) return Err(unwrapErr(output));
		const graph = moduleGraphOf({ stdout: unwrap(output).stdout, entry });
		if (isErr(graph)) return Err(unwrapErr(graph));
		graphs.push(unwrap(graph));
	}
	return Ok({
		ok: true,
		dependencies: workspaceDependencies({
			graphs,
			packageDirectory: directory,
			candidates,
		}),
	});
}

function moduleGraphOf({
	stdout,
	entry,
}: {
	stdout: string;
	entry: string;
}): Result<ModuleGraph, PluginError> {
	const failure = (detail: string): Result<ModuleGraph, PluginError> =>
		Err({
			kind: "command-failed",
			command: `deno info --json ${entry}`,
			detail: `unexpected output: ${detail}`,
		});
	const json = parseStdin(stdout);
	if (isErr(json)) return failure(describePluginError(unwrapErr(json)));
	const graph = parseModuleGraph(unwrap(json));
	if (isErr(graph)) return failure(unwrapErr(graph));
	return Ok(unwrap(graph));
}

async function release(io: Io): OpResult {
	const environment = readVersionedPackageEnvironment(io.env);
	if (isErr(environment)) return Err(unwrapErr(environment));
	const parsed = unwrap(environment);
	const directory = packageDirectoryOf(parsed);

	// Per-package publish, ordered by get-dependencies; OIDC auth is automatic
	// under GitHub Actions. No --allow-dirty: dv's require-clean-tree holds.
	const run = await io.run({
		command: "deno",
		args: ["publish"],
		cwd: directory,
	});
	const finished = isErr(run)
		? { code: 1, stdout: "", stderr: unwrapErr(run) }
		: unwrap(run);
	const output = `${finished.stdout}${finished.stderr}`;
	if (output.trim().length > 0) io.log(output.trimEnd());
	return Ok({
		...releaseResponse({
			name: parsed.DV_PACKAGE_NAME,
			version: parsed.DV_NEW_VERSION,
			exitCode: finished.code,
			output,
		}),
	});
}

async function finalize(io: Io): OpResult {
	const environment = readBaseEnvironment(io.env);
	if (isErr(environment)) return Err(unwrapErr(environment));
	const { DV_REPO_ROOT: root } = unwrap(environment);

	const install = await succeed({
		io,
		command: "deno",
		args: ["install", "--quiet"],
		cwd: root,
	});
	if (isErr(install)) return Err(unwrapErr(install));

	// Compare against HEAD, not a before/after snapshot: the lockfile can drift
	// from earlier tooling in the same session and must still ship.
	const status = await succeed({
		io,
		command: "git",
		args: ["status", "--porcelain", "--", "deno.lock"],
		cwd: root,
	});
	if (isErr(status)) return Err(unwrapErr(status));
	const drifted = unwrap(status).stdout.trim().length > 0;
	return Ok({
		ok: true,
		additionalChangedFiles: drifted ? ["deno.lock"] : [],
		message: drifted ? "deno.lock refreshed" : "deno.lock already up to date",
	});
}

function packageDirectoryOf(environment: PackageEnvironment): string {
	return resolve(environment.DV_REPO_ROOT, environment.DV_PACKAGE_PATH);
}

function manifestPathOf(environment: PackageEnvironment): string {
	return join(packageDirectoryOf(environment), MANIFEST);
}

async function readManifest({
	io,
	path,
}: {
	io: Io;
	path: string;
}): Promise<Result<DenoManifest, PluginError>> {
	const text = await io.readTextFile(path);
	if (isErr(text)) {
		return Err({ kind: "unreadable-file", path, detail: unwrapErr(text) });
	}
	const manifest = parseManifest(unwrap(text));
	if (isErr(manifest)) {
		const error = unwrapErr(manifest);
		return Err({
			kind: "invalid-manifest",
			path,
			detail:
				error.kind === "invalid-shape"
					? error.detail
					: describeJsonEditError(error),
		});
	}
	return Ok(unwrap(manifest));
}

async function packageManifest(
	io: Io,
): Promise<Result<{ manifest: DenoManifest; directory: string }, PluginError>> {
	const environment = readPackageEnvironment(io.env);
	if (isErr(environment)) return Err(unwrapErr(environment));
	const directory = packageDirectoryOf(unwrap(environment));
	const manifest = await readManifest({ io, path: join(directory, MANIFEST) });
	if (isErr(manifest)) return Err(unwrapErr(manifest));
	return Ok({ manifest: unwrap(manifest), directory });
}

async function writeFile({
	io,
	path,
	text,
	response,
}: {
	io: Io;
	path: string;
	text: string;
	response: Record<string, unknown>;
}): OpResult {
	const written = await io.writeTextFile({ path, text });
	if (isErr(written)) {
		return Err({ kind: "unreadable-file", path, detail: unwrapErr(written) });
	}
	return Ok(response);
}

async function succeed({
	io,
	command,
	args,
	cwd,
}: {
	io: Io;
	command: string;
	args: readonly string[];
	cwd: string;
}): Promise<Result<CommandOutput, PluginError>> {
	const label = [command, ...args].join(" ");
	const run = await io.run({ command, args, cwd });
	if (isErr(run)) {
		return Err({
			kind: "command-failed",
			command: label,
			detail: unwrapErr(run),
		});
	}
	const output = unwrap(run);
	if (output.code !== 0) {
		return Err({
			kind: "command-failed",
			command: label,
			detail: `exit ${output.code}: ${output.stderr.trim() || "<no stderr>"}`,
		});
	}
	return Ok(output);
}

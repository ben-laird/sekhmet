/**
 * The probe: the code that runs inside the runtime under test. It imports
 * every export path of every package, then runs each package's exercise, and
 * reports what happened as JSON. It uses no runtime-specific API.
 *
 * @module
 */

/** Prefixes the report line, so it can be found among other output. */
export const REPORT_MARKER = "COMPAT_SMOKE_REPORT ";

/** A module namespace object: what `import()` resolves to. */
export type ModuleNamespace = Readonly<Record<string, unknown>>;

/** One export path to import. */
export interface Load {
	/** The package that exposes it */
	readonly package: string;
	/** The bare specifier */
	readonly specifier: string;
	/** Imports it; a literal `import()` so bundlers can see it */
	readonly load: () => Promise<ModuleNamespace>;
}

/** A package's exercise module: real work through its public API. */
export interface ExerciseModule {
	/** Runs the exercise; throws when the package misbehaves */
	readonly exercise: () => void | Promise<void>;
}

/** Each package's exercise, loaded lazily so one broken package stays isolated. */
export type Exercises = Readonly<Record<string, () => Promise<ExerciseModule>>>;

/** Whether a step worked, and if not, why. */
export type Outcome =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: string };

/** What happened to one export path. */
export type LoadReport = {
	readonly package: string;
	readonly specifier: string;
} & (
	| { readonly ok: true; readonly exports: number }
	| { readonly ok: false; readonly error: string }
);

/** What happened to one package's exercise. */
export type ExerciseReport = { readonly package: string } & Outcome;

/** Everything the probe observed. */
export interface Report {
	/** The runtime's own description of itself */
	readonly runtime: string;
	/** One entry per export path, in load order */
	readonly loads: readonly LoadReport[];
	/** One entry per package, in first-load order */
	readonly exercises: readonly ExerciseReport[];
}

function describeError(error: unknown): string {
	return error instanceof Error
		? `${error.name}: ${error.message}`
		: String(error);
}

async function attempt(step: () => unknown): Promise<Outcome> {
	try {
		await step();
		return { ok: true };
	} catch (error: unknown) {
		return { ok: false, error: describeError(error) };
	}
}

function property(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null
		? Reflect.get(value, key)
		: undefined;
}

function describeRuntime(): string {
	// Deno and Bun also set process.versions.node, so they are asked first.
	const deno = property(property(globalThis, "Deno"), "version");
	const denoVersion = property(deno, "deno");
	if (typeof denoVersion === "string") return `deno ${denoVersion}`;
	const versions = property(property(globalThis, "process"), "versions");
	const bun = property(versions, "bun");
	if (typeof bun === "string") return `bun ${bun}`;
	const node = property(versions, "node");
	if (typeof node === "string") return `node ${node}`;
	const userAgent = property(property(globalThis, "navigator"), "userAgent");
	return typeof userAgent === "string" ? userAgent : "unknown";
}

/**
 * Imports every export path, then runs the exercise of every package that
 * appears in `loads`. Nothing it runs can throw past it: each failure is
 * recorded in the report.
 *
 * @param params - The export paths and the exercises
 * @returns The report
 */
export async function runProbe({
	loads,
	exercises,
}: {
	loads: readonly Load[];
	exercises: Exercises;
}): Promise<Report> {
	const loadReports: LoadReport[] = [];
	for (const { package: pkg, specifier, load } of loads) {
		let namespace: ModuleNamespace | undefined;
		const outcome = await attempt(async () => {
			namespace = await load();
		});
		loadReports.push(
			outcome.ok
				? {
						package: pkg,
						specifier,
						ok: true,
						exports: Object.keys(namespace ?? {}).length,
					}
				: { package: pkg, specifier, ...outcome },
		);
	}

	const exerciseReports: ExerciseReport[] = [];
	for (const pkg of new Set(loads.map((load) => load.package))) {
		const exercise = exercises[pkg];
		const outcome =
			exercise === undefined
				? { ok: false as const, error: `no exercise is defined for ${pkg}` }
				: await attempt(async () => (await exercise()).exercise());
		exerciseReports.push({ package: pkg, ...outcome });
	}

	return {
		runtime: describeRuntime(),
		loads: loadReports,
		exercises: exerciseReports,
	};
}

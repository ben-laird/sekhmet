import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { z } from "zod";
import {
	type JsonEditError,
	parseJsonc,
	replaceStringField,
} from "./json-edit.ts";
import { packageNameOf, withVersion } from "./specifier.ts";

/**
 * The fields of a workspace member's `deno.json` the plugin reads.
 */
export interface DenoManifest {
	/** JSR package name, e.g. `@sekhmet/enum`. Absent on unnamed members. */
	name?: string | undefined;
	/** Current semver version. */
	version?: string | undefined;
	/** `false` opts the member out of publishing; an object configures it. */
	publish?: unknown;
	/** A single entry point or a map of subpath → entry point. */
	exports?: string | Record<string, string> | undefined;
	/** The member's own import map. */
	imports?: Record<string, string> | undefined;
}

const denoManifestSchema: z.ZodType<DenoManifest> = z.looseObject({
	name: z.string().min(1).optional(),
	version: z.string().min(1).optional(),
	publish: z.unknown().optional(),
	exports: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
	imports: z.record(z.string(), z.string()).optional(),
});

/**
 * Why a manifest could not be read.
 */
export type ManifestError =
	| JsonEditError
	| { kind: "invalid-shape"; detail: string };

/**
 * Parses and validates `deno.json` text.
 *
 * @param text The manifest source (JSON with comments).
 * @returns The validated manifest, or why it is unusable.
 */
export function parseManifest(
	text: string,
): Result<DenoManifest, ManifestError> {
	const parsed = parseJsonc(text);
	if (isErr(parsed)) return Err(unwrapErr(parsed));
	const validated = denoManifestSchema.safeParse(unwrap(parsed));
	if (!validated.success) {
		return Err({
			kind: "invalid-shape",
			detail: z.prettifyError(validated.error),
		});
	}
	return Ok(validated.data);
}

/**
 * A package dv may version and release: a named member that publishes.
 *
 * Members marked `"publish": false` (the scripts and their templates) are
 * workspace tooling, never JSR packages, so dv must not see them.
 *
 * @param manifest The member's manifest.
 * @returns Whether dv should track the member.
 */
export function isReleasable(manifest: DenoManifest): boolean {
	return manifest.name !== undefined && manifest.publish !== false;
}

/**
 * Lists the member-relative entry points a manifest exports.
 *
 * @param manifest The member's manifest.
 * @returns Entry points in declaration order, without duplicates.
 */
export function exportTargets(manifest: DenoManifest): string[] {
	const { exports } = manifest;
	if (exports === undefined) return [];
	if (typeof exports === "string") return [exports];
	return [...new Set(Object.values(exports))];
}

/**
 * Sets the manifest's `version`, preserving the file's formatting.
 *
 * @param args.text The manifest source.
 * @param args.version The new version.
 * @returns The edited source, or why it could not be edited.
 */
export function setVersion({
	text,
	version,
}: {
	text: string;
	version: string;
}): Result<string, JsonEditError> {
	return replaceStringField({ text, path: ["version"], value: version });
}

/**
 * The outcome of rewriting a dependency constraint.
 */
export interface DependencyUpdate {
	/** The manifest source after the rewrite. */
	text: string;
	/** Whether any constraint changed. */
	changed: boolean;
}

/**
 * Points every import-map entry that targets `dependency` at `version`,
 * preserving the file's formatting and each entry's range operator.
 *
 * Workspace members normally import each other through bare specifiers that
 * the workspace resolves, so most manifests carry no such entry; that is the
 * `changed: false` path.
 *
 * @param args.text The dependent's manifest source.
 * @param args.dependency The package whose version moved, e.g. `@sekhmet/enum`.
 * @param args.version The dependency's new version.
 * @returns The edited source and whether it changed, or why it could not be
 *   edited.
 */
export function updateDependency({
	text,
	dependency,
	version,
}: {
	text: string;
	dependency: string;
	version: string;
}): Result<DependencyUpdate, ManifestError> {
	const manifest = parseManifest(text);
	if (isErr(manifest)) return Err(unwrapErr(manifest));
	const imports = unwrap(manifest).imports ?? {};

	let edited = text;
	for (const [key, specifier] of Object.entries(imports)) {
		if (packageNameOf(specifier) !== dependency) continue;
		const rewritten = withVersion({ specifier, version });
		if (rewritten === specifier) continue;
		const result = replaceStringField({
			text: edited,
			path: ["imports", key],
			value: rewritten,
		});
		if (isErr(result)) return Err(unwrapErr(result));
		edited = unwrap(result);
	}
	return Ok({ text: edited, changed: edited !== text });
}

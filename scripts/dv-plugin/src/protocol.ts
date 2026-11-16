import {
	Err,
	isErr,
	Ok,
	type Result,
	unwrap,
	unwrapErr,
} from "@sekhmet/enum/result/mini";
import { z } from "zod";

/**
 * The dv plugin contract version this plugin speaks. dv 0.11 expects `"1"`.
 */
export const CONTRACT_VERSION = "1";

/**
 * Every op this plugin implements, in the order dv documents them.
 */
export const SUPPORTED_OPS: readonly Op[] = [
	"info",
	"discover",
	"read-version",
	"write-version",
	"update-dependency",
	"get-dependencies",
	"release",
	"finalize",
];

/**
 * A dv plugin op name.
 */
export type Op =
	| "info"
	| "discover"
	| "read-version"
	| "write-version"
	| "update-dependency"
	| "get-dependencies"
	| "release"
	| "finalize";

/**
 * Narrows a command-line argument to a supported {@linkcode Op}.
 *
 * @param value The first CLI argument.
 * @returns Whether the plugin implements the op.
 */
export function isOp(value: string | undefined): value is Op {
	return SUPPORTED_OPS.some((op) => op === value);
}

/**
 * Why the plugin could not serve an op. Every variant becomes a
 * `{ ok: false, error }` response and a non-zero exit (except in `release`,
 * whose failures are data).
 */
export type PluginError =
	| { kind: "invalid-environment"; detail: string }
	| { kind: "invalid-stdin"; detail: string }
	| { kind: "unreadable-file"; path: string; detail: string }
	| { kind: "invalid-manifest"; path: string; detail: string }
	| { kind: "command-failed"; command: string; detail: string };

/**
 * Renders a {@linkcode PluginError} as the `error` string dv shows the user.
 *
 * @param error The error to describe.
 * @returns A one-line description.
 */
export function describePluginError(error: PluginError): string {
	switch (error.kind) {
		case "invalid-environment":
			return `invalid environment: ${error.detail}`;
		case "invalid-stdin":
			return `invalid stdin payload: ${error.detail}`;
		case "unreadable-file":
			return `cannot read ${error.path}: ${error.detail}`;
		case "invalid-manifest":
			return `invalid manifest ${error.path}: ${error.detail}`;
		case "command-failed":
			return `${error.command} failed: ${error.detail}`;
	}
}

/**
 * Environment dv sets on every invocation.
 */
export interface BaseEnvironment {
	/** Absolute path to the repository root. */
	DV_REPO_ROOT: string;
}

/**
 * Environment dv sets for per-package ops.
 */
export interface PackageEnvironment extends BaseEnvironment {
	/** The package's name. */
	DV_PACKAGE_NAME: string;
	/** The package directory, absolute or relative to the repo root. */
	DV_PACKAGE_PATH: string;
}

/**
 * Environment dv sets for `discover`.
 */
export interface DiscoverEnvironment extends BaseEnvironment {
	/** The `match` glob from `.dv/config.yaml`, relative to the repo root. */
	DV_DISCOVER_GLOB: string;
}

/**
 * Environment dv sets for `write-version` and `release`.
 */
export interface VersionedPackageEnvironment extends PackageEnvironment {
	/** The version being written or published. */
	DV_NEW_VERSION: string;
}

const nonEmpty = z.string().min(1);

const environmentSchemas: {
	base: z.ZodType<BaseEnvironment>;
	package: z.ZodType<PackageEnvironment>;
	discover: z.ZodType<DiscoverEnvironment>;
	versionedPackage: z.ZodType<VersionedPackageEnvironment>;
} = {
	base: z.object({ DV_REPO_ROOT: nonEmpty }),
	package: z.object({
		DV_REPO_ROOT: nonEmpty,
		DV_PACKAGE_NAME: nonEmpty,
		DV_PACKAGE_PATH: nonEmpty,
	}),
	discover: z.object({ DV_REPO_ROOT: nonEmpty, DV_DISCOVER_GLOB: nonEmpty }),
	versionedPackage: z.object({
		DV_REPO_ROOT: nonEmpty,
		DV_PACKAGE_NAME: nonEmpty,
		DV_PACKAGE_PATH: nonEmpty,
		DV_NEW_VERSION: nonEmpty,
	}),
};

/**
 * The `update-dependency` stdin payload.
 */
export interface UpdateDependencyPayload {
	/** The package whose version moved. */
	dependency: string;
	/** Its new version. */
	new_version: string;
}

/**
 * The `get-dependencies` stdin payload.
 */
export interface GetDependenciesPayload {
	/** Every other discovered package's name. */
	candidates: string[];
}

const payloadSchemas: {
	updateDependency: z.ZodType<UpdateDependencyPayload>;
	getDependencies: z.ZodType<GetDependenciesPayload>;
} = {
	updateDependency: z.looseObject({
		dependency: nonEmpty,
		new_version: nonEmpty,
	}),
	getDependencies: z.looseObject({ candidates: z.array(z.string()) }),
};

function validate<T>({
	schema,
	value,
	kind,
}: {
	schema: z.ZodType<T>;
	value: unknown;
	kind: "invalid-environment" | "invalid-stdin";
}): Result<T, PluginError> {
	const parsed = schema.safeParse(value);
	return parsed.success
		? Ok(parsed.data)
		: Err({ kind, detail: z.prettifyError(parsed.error) });
}

/**
 * Reads the environment every op receives.
 *
 * @param env The process environment.
 * @returns The validated variables, or an `invalid-environment` error.
 */
export function readBaseEnvironment(
	env: unknown,
): Result<BaseEnvironment, PluginError> {
	return validate({
		schema: environmentSchemas.base,
		value: env,
		kind: "invalid-environment",
	});
}

/**
 * Reads the environment of a per-package op.
 *
 * @param env The process environment.
 * @returns The validated variables, or an `invalid-environment` error.
 */
export function readPackageEnvironment(
	env: unknown,
): Result<PackageEnvironment, PluginError> {
	return validate({
		schema: environmentSchemas.package,
		value: env,
		kind: "invalid-environment",
	});
}

/**
 * Reads the environment of `discover`.
 *
 * @param env The process environment.
 * @returns The validated variables, or an `invalid-environment` error.
 */
export function readDiscoverEnvironment(
	env: unknown,
): Result<DiscoverEnvironment, PluginError> {
	return validate({
		schema: environmentSchemas.discover,
		value: env,
		kind: "invalid-environment",
	});
}

/**
 * Reads the environment of `write-version` and `release`.
 *
 * @param env The process environment.
 * @returns The validated variables, or an `invalid-environment` error.
 */
export function readVersionedPackageEnvironment(
	env: unknown,
): Result<VersionedPackageEnvironment, PluginError> {
	return validate({
		schema: environmentSchemas.versionedPackage,
		value: env,
		kind: "invalid-environment",
	});
}

function parsePayload<T>({
	text,
	schema,
}: {
	text: string;
	schema: z.ZodType<T>;
}): Result<T, PluginError> {
	const json = parseStdin(text);
	if (isErr(json)) return Err(unwrapErr(json));
	return validate({ schema, value: unwrap(json), kind: "invalid-stdin" });
}

/**
 * Parses the `update-dependency` stdin payload.
 *
 * @param text The raw stdin.
 * @returns The payload, or an `invalid-stdin` error.
 */
export function parseUpdateDependencyPayload(
	text: string,
): Result<UpdateDependencyPayload, PluginError> {
	return parsePayload({ text, schema: payloadSchemas.updateDependency });
}

/**
 * Parses the `get-dependencies` stdin payload.
 *
 * @param text The raw stdin.
 * @returns The payload, or an `invalid-stdin` error.
 */
export function parseGetDependenciesPayload(
	text: string,
): Result<GetDependenciesPayload, PluginError> {
	return parsePayload({ text, schema: payloadSchemas.getDependencies });
}

/**
 * Parses stdin text as JSON, as a value.
 *
 * @param text The raw stdin.
 * @returns The parsed JSON, or an `invalid-stdin` error.
 */
export function parseStdin(text: string): Result<unknown, PluginError> {
	try {
		return Ok(JSON.parse(text));
	} catch (caught: unknown) {
		const detail = caught instanceof Error ? caught.message : String(caught);
		return Err({ kind: "invalid-stdin", detail });
	}
}

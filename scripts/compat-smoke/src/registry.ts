/**
 * Reading what is published on JSR: which version to test, and the export map
 * that version was published with.
 *
 * @module
 */

import { z } from "zod";
import type { PackageName, PublishedPackage } from "@/src/package.ts";
import { err, ok, type Result } from "@/src/result.ts";

/** The JSR registry's public API root. */
export const JSR_ORIGIN = "https://jsr.io";

/** `https://jsr.io/@scope/name/meta.json`: every version and the latest. */
const PackageMeta = z.object({
	latest: z.string().nullable(),
	versions: z.record(z.string(), z.unknown()),
});

/** `https://jsr.io/@scope/name/<version>_meta.json`: one version's exports. */
const VersionMeta = z.object({
	exports: z.record(z.string(), z.string()),
});

/** The versions a run asks for; a package not named gets `all`, else latest. */
export interface VersionRequests {
	/** The version every package not in `byPackage` is tested at */
	readonly all: string | undefined;
	/** Versions for individual packages */
	readonly byPackage: ReadonlyMap<PackageName, string>;
}

/** The ways reading the registry can fail. */
export type RegistryError =
	| { readonly kind: "network"; readonly url: string; readonly message: string }
	| { readonly kind: "http"; readonly url: string; readonly status: number }
	| { readonly kind: "schema"; readonly url: string; readonly message: string }
	| { readonly kind: "unpublished"; readonly name: PackageName }
	| {
			readonly kind: "unknown-version";
			readonly name: PackageName;
			readonly version: string;
			readonly available: readonly string[];
	  };

/**
 * Picks the version to test: the one requested for this package, else the one
 * requested for all, else the latest. A requested version must exist.
 *
 * @param params - The package, its registry metadata and the requests
 * @returns The exact version, or why there is none
 */
export function resolveVersion({
	name,
	latest,
	versions,
	requests,
}: {
	name: PackageName;
	latest: string | null;
	versions: readonly string[];
	requests: VersionRequests;
}): Result<string, RegistryError> {
	const requested = requests.byPackage.get(name) ?? requests.all;
	if (requested === undefined) {
		return latest === null ? err({ kind: "unpublished", name }) : ok(latest);
	}
	return versions.includes(requested)
		? ok(requested)
		: err({
				kind: "unknown-version",
				name,
				version: requested,
				available: versions,
			});
}

async function fetchJson<T>({
	url,
	schema,
	fetch,
}: {
	url: string;
	schema: z.ZodType<T>;
	fetch: typeof globalThis.fetch;
}): Promise<Result<T, RegistryError>> {
	let response: Response;
	try {
		response = await fetch(url, { headers: { accept: "application/json" } });
	} catch (error: unknown) {
		return err({ kind: "network", url, message: String(error) });
	}
	if (!response.ok) {
		await response.body?.cancel();
		return err({ kind: "http", url, status: response.status });
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch (error: unknown) {
		return err({ kind: "schema", url, message: String(error) });
	}
	const parsed = schema.safeParse(body);
	return parsed.success
		? ok(parsed.data)
		: err({ kind: "schema", url, message: z.prettifyError(parsed.error) });
}

/**
 * Looks a package up on JSR: resolves the version to test and reads the
 * export map it was published with.
 *
 * @param params - The package, the version requests and the `fetch` to use
 * @returns The published package, or why it could not be read
 */
export async function fetchPublished({
	name,
	requests,
	fetch,
}: {
	name: PackageName;
	requests: VersionRequests;
	fetch: typeof globalThis.fetch;
}): Promise<Result<PublishedPackage, RegistryError>> {
	const meta = await fetchJson({
		url: `${JSR_ORIGIN}/${name}/meta.json`,
		schema: PackageMeta,
		fetch,
	});
	if (!meta.ok) {
		return meta.error.kind === "http" && meta.error.status === 404
			? err({ kind: "unpublished", name })
			: meta;
	}

	const version = resolveVersion({
		name,
		latest: meta.value.latest,
		versions: Object.keys(meta.value.versions),
		requests,
	});
	if (!version.ok) return version;

	const published = await fetchJson({
		url: `${JSR_ORIGIN}/${name}/${version.value}_meta.json`,
		schema: VersionMeta,
		fetch,
	});
	if (!published.ok) return published;

	return ok({ name, version: version.value, exports: published.value.exports });
}

/**
 * Describes a registry failure for a person reading the log.
 *
 * @param error - The failure
 * @returns One line of text
 */
export function describeRegistryError(error: RegistryError): string {
	switch (error.kind) {
		case "network":
			return `could not reach ${error.url}: ${error.message}`;
		case "http":
			return `${error.url} answered HTTP ${error.status}`;
		case "schema":
			return `unexpected response from ${error.url}: ${error.message}`;
		case "unpublished":
			return `${error.name} is not published on JSR`;
		case "unknown-version":
			return `${error.name}@${error.version} is not published (available: ${error.available.join(", ") || "none"})`;
	}
}

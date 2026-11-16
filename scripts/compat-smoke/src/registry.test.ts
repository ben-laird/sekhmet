import { Err, isErr, Ok, unwrapErr } from "@sekhmet/enum/result/mini";
import { assertEquals } from "@std/assert";
import { isPackageName, type PackageName } from "@/src/package.ts";
import {
	describeRegistryError,
	fetchPublished,
	JSR_ORIGIN,
	resolveVersion,
	type VersionRequests,
} from "@/src/registry.ts";

function name(text: string): PackageName {
	if (!isPackageName(text)) throw new Error(`bad fixture: ${text}`);
	return text;
}

const ENUM = name("@sekhmet/enum");
const LATEST: VersionRequests = { all: undefined, byPackage: new Map() };

function fakeFetch(
	responses: Record<string, unknown>,
): typeof globalThis.fetch {
	return (input) => {
		const url = String(input);
		const body = responses[url];
		return Promise.resolve(
			body === undefined
				? new Response("not found", { status: 404 })
				: Response.json(body),
		);
	};
}

Deno.test("resolveVersion prefers a package's request, then the global one, then latest", async (t) => {
	const versions = ["0.1.0", "0.2.0", "0.3.0"];

	await t.step("no request picks the latest", () => {
		// Given: no requests

		// When: the version is resolved
		const version = resolveVersion({
			name: ENUM,
			latest: "0.3.0",
			versions,
			requests: LATEST,
		});

		// Then: it is the latest
		assertEquals(version, Ok("0.3.0"));
	});

	await t.step("a per-package request beats the global one", () => {
		// Given: a global and a per-package request
		const requests = { all: "0.1.0", byPackage: new Map([[ENUM, "0.2.0"]]) };

		// When: the version is resolved
		const version = resolveVersion({
			name: ENUM,
			latest: "0.3.0",
			versions,
			requests,
		});

		// Then: the per-package one wins
		assertEquals(version, Ok("0.2.0"));
	});

	await t.step("a request for an unpublished version fails", () => {
		// Given: a request for a version that does not exist
		const requests = { all: "9.9.9", byPackage: new Map() };

		// When: the version is resolved
		const version = resolveVersion({
			name: ENUM,
			latest: "0.3.0",
			versions,
			requests,
		});

		// Then: it fails and lists what is available
		assertEquals(
			version,
			Err({
				kind: "unknown-version",
				name: ENUM,
				version: "9.9.9",
				available: versions,
			}),
		);
	});

	await t.step("no latest means nothing is published", () => {
		// Given: a package with no latest version

		// When: the version is resolved without a request
		const version = resolveVersion({
			name: ENUM,
			latest: null,
			versions: [],
			requests: LATEST,
		});

		// Then: the package counts as unpublished
		assertEquals(version, Err({ kind: "unpublished", name: ENUM }));
	});
});

Deno.test("fetchPublished reads the export map of the resolved version", async () => {
	// Given: a registry with two versions of a package
	const fetch = fakeFetch({
		[`${JSR_ORIGIN}/@sekhmet/enum/meta.json`]: {
			latest: "0.2.0",
			versions: { "0.1.0": {}, "0.2.0": {} },
		},
		[`${JSR_ORIGIN}/@sekhmet/enum/0.2.0_meta.json`]: {
			exports: { "./option": "./src/option/main/mod.ts" },
		},
	});

	// When: the package is looked up
	const published = await fetchPublished({
		name: ENUM,
		requests: LATEST,
		fetch,
	});

	// Then: the latest version and its exports come back
	assertEquals(
		published,
		Ok({
			name: ENUM,
			version: "0.2.0",
			exports: { "./option": "./src/option/main/mod.ts" },
		}),
	);
});

Deno.test("fetchPublished turns registry failures into values", async (t) => {
	await t.step("a 404 package is unpublished", async () => {
		// Given: a registry that knows nothing
		const fetch = fakeFetch({});

		// When: the package is looked up
		const published = await fetchPublished({
			name: ENUM,
			requests: LATEST,
			fetch,
		});

		// Then: it is reported as unpublished
		assertEquals(published, Err({ kind: "unpublished", name: ENUM }));
	});

	await t.step("an unexpected body is a schema error", async () => {
		// Given: a registry answering with the wrong shape
		const fetch = fakeFetch({
			[`${JSR_ORIGIN}/@sekhmet/enum/meta.json`]: { latest: 1 },
		});

		// When: the package is looked up
		const published = await fetchPublished({
			name: ENUM,
			requests: LATEST,
			fetch,
		});

		// Then: it fails as a schema error naming the URL
		assertEquals(
			isErr(published) ? unwrapErr(published).kind : undefined,
			"schema",
		);
	});

	await t.step("a thrown fetch is a network error", async () => {
		// Given: a fetch that cannot reach the registry
		const fetch: typeof globalThis.fetch = () =>
			Promise.reject(new TypeError("offline"));

		// When: the package is looked up
		const published = await fetchPublished({
			name: ENUM,
			requests: LATEST,
			fetch,
		});

		// Then: it fails as a network error
		assertEquals(
			published,
			Err({
				kind: "network",
				url: `${JSR_ORIGIN}/@sekhmet/enum/meta.json`,
				message: "TypeError: offline",
			}),
		);
	});

	await t.step("a server error is an HTTP error", async () => {
		// Given: a registry answering 503
		const fetch: typeof globalThis.fetch = () =>
			Promise.resolve(new Response("down", { status: 503 }));

		// When: the package is looked up
		const published = await fetchPublished({
			name: ENUM,
			requests: LATEST,
			fetch,
		});

		// Then: it fails with the status
		assertEquals(
			published,
			Err({
				kind: "http",
				url: `${JSR_ORIGIN}/@sekhmet/enum/meta.json`,
				status: 503,
			}),
		);
	});
});

Deno.test("describeRegistryError says what went wrong in one line", () => {
	// Given: an unknown-version failure
	const error = {
		kind: "unknown-version",
		name: ENUM,
		version: "9.9.9",
		available: ["0.1.0"],
	} as const;

	// When: it is described
	const line = describeRegistryError(error);

	// Then: the line names the package, the version and the alternatives
	assertEquals(line, "@sekhmet/enum@9.9.9 is not published (available: 0.1.0)");
});

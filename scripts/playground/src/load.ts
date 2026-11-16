/**
 * Imports the discovered namespaces and reports what loaded.
 *
 * @module
 */

import type { Namespace } from "@/src/discover.ts";

/** What happened when the playground imported one namespace. */
export type Loaded =
	| {
			readonly kind: "loaded";
			readonly namespace: Namespace;
			readonly module: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly kind: "failed";
			readonly namespace: Namespace;
			readonly reason: string;
	  };

/** Imports a module by specifier; `import()` at the edge, a fake in tests. */
export type Importer = (
	specifier: string,
) => Promise<Readonly<Record<string, unknown>>>;

/**
 * Imports every namespace, turning an import failure into a `failed` entry
 * so one broken package never stops the others from loading.
 *
 * @param options - The namespaces and the importer to load them with
 * @returns One entry per namespace, in order
 */
export function loadNamespaces({
	namespaces,
	importer,
}: {
	namespaces: readonly Namespace[];
	importer: Importer;
}): Promise<Loaded[]> {
	return Promise.all(
		namespaces.map(async (namespace): Promise<Loaded> => {
			try {
				return {
					kind: "loaded",
					namespace,
					module: await importer(namespace.specifier),
				};
			} catch (error: unknown) {
				const reason = error instanceof Error ? error.message : String(error);
				return { kind: "failed", namespace, reason };
			}
		}),
	);
}

/**
 * Renders the startup table: one row per namespace with its specifier and
 * export count, or a warning when it failed to load.
 *
 * @param loaded - The outcome of {@linkcode loadNamespaces}
 * @returns The table, one line per row
 */
export function formatTable(loaded: readonly Loaded[]): string {
	const width = Math.max(
		"namespace".length,
		...loaded.map(({ namespace }) => namespace.name.length),
	);
	const specifierWidth = Math.max(
		"import".length,
		...loaded.map(({ namespace }) => namespace.specifier.length),
	);

	const row = (name: string, specifier: string, detail: string): string =>
		`${name.padEnd(width)}  ${specifier.padEnd(specifierWidth)}  ${detail}`.trimEnd();

	return [
		row("namespace", "import", "exports"),
		...loaded.map((entry) =>
			entry.kind === "loaded"
				? row(
						entry.namespace.name,
						entry.namespace.specifier,
						String(Object.keys(entry.module).length),
					)
				: row(
						entry.namespace.name,
						entry.namespace.specifier,
						`warning: failed to load (${entry.reason.split("\n")[0]})`,
					),
		),
	].join("\n");
}

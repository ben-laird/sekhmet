// deno-coverage-ignore-file
/**
 * The `deno task play` prelude: imported by `deno repl --eval`, it discovers
 * every workspace package's public features, imports each one and binds it
 * to a global namespace (`option`, `result`, `vow`, …), then prints what
 * loaded. A feature that fails to import is reported, not fatal.
 *
 * @module
 */

import { discoverNamespaces } from "@/src/discover.ts";
import { formatTable, loadNamespaces } from "@/src/load.ts";
import { readManifests } from "@/src/workspace.ts";

const ROOT = new URL("../../", import.meta.url);

const { manifests, warnings: unread } = await readManifests(ROOT);
const warnings = [...unread];
const loaded = await loadNamespaces({
	namespaces: discoverNamespaces(manifests),
	importer: (specifier) => import(specifier),
});

for (const entry of loaded) {
	if (entry.kind !== "loaded") continue;
	if (entry.namespace.name in globalThis) {
		warnings.push(
			`\`${entry.namespace.name}\` is already a global; not rebinding it`,
		);
		continue;
	}
	Reflect.set(globalThis, entry.namespace.name, entry.module);
}

console.log(formatTable(loaded));
for (const warning of warnings) console.warn(`warning: ${warning}`);
console.log(
	"\nEach namespace is a global, e.g. option.Some(2).map((n) => n * 21).unwrap()",
);

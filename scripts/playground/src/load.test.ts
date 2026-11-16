import { assertEquals } from "@std/assert";
import type { Namespace } from "@/src/discover.ts";
import { formatTable, type Importer, loadNamespaces } from "@/src/load.ts";

const OPTION: Namespace = { name: "option", specifier: "@sekhmet/enum/option" };
const BROKEN: Namespace = { name: "broken", specifier: "@sekhmet/broken" };

const importer: Importer = (specifier) =>
	specifier === OPTION.specifier
		? Promise.resolve({ Some: 1, None: 2 })
		: Promise.reject(new Error(`cannot load ${specifier}\nstack`));

Deno.test("loadNamespaces", async (t) => {
	await t.step("a failed import becomes a failed entry", async () => {
		// Given: one importable namespace and one that throws on import
		const namespaces = [OPTION, BROKEN];

		// When: loading them
		const loaded = await loadNamespaces({ namespaces, importer });

		// Then: the good one loads and the broken one carries its reason
		assertEquals(loaded, [
			{ kind: "loaded", namespace: OPTION, module: { Some: 1, None: 2 } },
			{
				kind: "failed",
				namespace: BROKEN,
				reason: "cannot load @sekhmet/broken\nstack",
			},
		]);
	});
});

Deno.test("formatTable", async (t) => {
	await t.step("lists export counts and warns on failures", async () => {
		// Given: a loaded and a failed namespace
		const loaded = await loadNamespaces({
			namespaces: [OPTION, BROKEN],
			importer,
		});

		// When: formatting the startup table
		const table = formatTable(loaded);

		// Then: columns align and the failure shows its first line only
		assertEquals(
			table,
			[
				"namespace  import                exports",
				"option     @sekhmet/enum/option  2",
				"broken     @sekhmet/broken       warning: failed to load (cannot load @sekhmet/broken)",
			].join("\n"),
		);
	});
});

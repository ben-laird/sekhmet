import { isOk, unwrapErr } from "@sekhmet/enum/result/mini";
import { Cycle, DuplicateName, defineJobs } from "@sekhmet/job";
import { assert, assertEquals } from "@std/assert";
import { trackGraph } from "@/src/graph.ts";

const { job } = defineJobs<null>();
const [a, b, c] = ["a", "b", "c"].map((name) => job({ name, run: () => {} }));

Deno.test("trackGraph: names are unique per job value", () => {
	// Given: a graph that knows a
	const graph = trackGraph();
	assert(a !== undefined);
	assert(isOk(graph.discover(a)));

	// When / Then: the same job again is fine; another job named a is not
	assert(isOk(graph.discover(a)));
	const twin = job({ name: "a", run: () => {} });
	assertEquals(unwrapErr(graph.discover(twin)), DuplicateName("a"));
});

Deno.test("trackGraph: an edge that closes a cycle is refused", () => {
	// Given: a -> b -> c
	assert(a !== undefined && b !== undefined && c !== undefined);
	const graph = trackGraph();
	assert(isOk(graph.link({ from: a, to: b })));
	assert(isOk(graph.link({ from: b, to: c })));

	// When / Then: a second path is fine, but c -> a closes a cycle
	assert(isOk(graph.link({ from: a, to: c })));
	assertEquals(
		unwrapErr(graph.link({ from: c, to: a })),
		Cycle(["c", "a", "b", "c"]),
	);

	// When / Then: so does a self-edge
	assertEquals(unwrapErr(graph.link({ from: b, to: b })), Cycle(["b", "b"]));
});

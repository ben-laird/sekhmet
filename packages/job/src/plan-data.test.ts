import { defineJobs, type Need } from "@sekhmet/job";
import { getStructParams } from "@sekhmet/primordials/struct";
import { assert, assertEquals } from "@std/assert";
import { collectNeeds, isPlainRecord, resolveNeeds } from "@/src/plan-data.ts";

const { job } = defineJobs<null>();
const a = job({ name: "a", run: () => 1 });
const b = job({ name: "b", run: () => 2 });

/** Builds needs on a and b, as a plan would. */
function needs(): {
	readonly onA: Need<number, false>;
	readonly onB: Need<number, false>;
} {
	let found: { onA: Need<number, false>; onB: Need<number, false> } | undefined;
	const probe = job({
		name: "probe",
		plan: (p) => {
			found = { onA: p.needs(a), onB: p.needs(b) };
			return {};
		},
		run: () => {},
	});
	getStructParams(probe).bind(null).plan();
	assert(found !== undefined);
	return found;
}

Deno.test("isPlainRecord accepts only plain objects", () => {
	// Given: plain and non-plain values
	// When: each is tested
	// Then: object literals and null-prototype objects are plain; the rest aren't
	assertEquals(isPlainRecord({}), true);
	assertEquals(isPlainRecord(Object.create(null)), true);
	assertEquals(isPlainRecord([]), false);
	assertEquals(isPlainRecord(new Map()), false);
	assertEquals(isPlainRecord(null), false);
});

Deno.test("collectNeeds finds needs at any depth, in order", () => {
	// Given: needs nested in arrays and records, beside a Map holding one
	const { onA, onB } = needs();
	const hidden = new Map([["need", onA]]);
	const plan = { first: [{ deep: onA }], hidden, second: { onB } };

	// When: needs are collected
	const found = collectNeeds(plan);

	// Then: both plain-data needs, in order; the Map isn't walked
	assertEquals(found.length, 2);
	assert(found[0] === onA && found[1] === onB);
});

Deno.test("resolveNeeds copies plain data, replacing each need", () => {
	// Given: a plan with needs under string and symbol keys, and a Map
	const { onA, onB } = needs();
	const key = Symbol("key");
	const lookup = new Map<string, number>();
	const plan = { list: [onA, 3], [key]: onB, lookup };

	// When: each need resolves to its job's name
	const resolved = resolveNeeds({
		value: plan,
		resolve: (need) => getStructParams(need).job.name,
	});

	// Then: needs are replaced in copies; the Map is passed through
	assert(isPlainRecord(resolved));
	assertEquals(resolved.list, ["a", 3]);
	assertEquals(resolved[key], "b");
	assert(resolved.lookup === lookup);
	assertEquals(plan.list[0], onA);
});

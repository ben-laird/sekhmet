/**
 * Exercises `@sekhmet/primordials`: a `Struct` subclass, a `Subtle` creator,
 * and the scoping helpers.
 *
 * @module
 */

import { block, define } from "@sekhmet/primordials/scoping";
import { getStructParams, Struct } from "@sekhmet/primordials/struct";
import { Subtle, useSubtle } from "@sekhmet/primordials/subtle";
import { expectEqual } from "../check.ts";

class Counter extends Struct<{ count: number }> {
	increment(): number {
		return ++getStructParams(this).count;
	}
}

/** Runs the exercise. */
export function exercise(): void {
	const counter = new Counter({ count: 0 });
	counter.increment();
	counter.increment();
	expectEqual({
		label: "struct params",
		actual: getStructParams(counter).count,
		expected: 2,
	});

	const connect = new Subtle({
		create: (url: string) => ({ url, open: true }),
	});
	expectEqual({
		label: "subtle creator",
		actual: useSubtle(connect, "wss://example.test"),
		expected: { url: "wss://example.test", open: true },
	});

	const label = block(() => {
		const hour = counter.increment() + 12;
		return hour < 12 ? "morning" : "afternoon";
	});
	const config = define<{ port: number }>({ port: 8080 });
	expectEqual({
		label: "scoping",
		actual: [label, config.port],
		expected: ["afternoon", 8080],
	});
}

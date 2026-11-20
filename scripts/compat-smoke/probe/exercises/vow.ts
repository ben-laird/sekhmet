/**
 * Exercises `@sekhmet/vow`: vows resolved synchronously through the root,
 * and a promise bridged into a vow through mini.
 *
 * @module
 */

import { unwrap } from "@sekhmet/enum/result/mini/unwrap";
import { definePanicRuntime } from "@sekhmet/panic";
import { map, vowWithResolver, wait, zipWith } from "@sekhmet/vow";
import { fromPromise, wait as miniWait, resolved } from "@sekhmet/vow/mini";
import { Vow } from "@sekhmet/vow/mini/core";
import { map as miniMap } from "@sekhmet/vow/mini/impl";
import { expectEqual } from "../check.ts";

/** Runs the exercise. */
export async function exercise(): Promise<void> {
	const { vow: price, resolve: setPrice } = vowWithResolver<number>();
	const { vow: quantity, resolve: setQuantity } = vowWithResolver<number>();

	const seen: number[] = [];
	const total = zipWith(price, quantity, (p, q) => p * q);
	map(total, (value) => seen.push(value));

	setPrice(5);
	expectEqual({ label: "waits for both", actual: seen, expected: [] });
	setQuantity(3);
	expectEqual({
		label: "resolves synchronously",
		actual: seen,
		expected: [15],
	});
	expectEqual({ label: "wait", actual: await wait(total), expected: 15 });

	const bridged = fromPromise({
		promise: Promise.resolve("ready"),
		panics: definePanicRuntime(),
	});
	expectEqual({
		label: "fromPromise",
		actual: unwrap(await miniWait(bridged)),
		expected: "ready",
	});

	const doubled = miniMap(resolved(21), (n) => n * 2);
	expectEqual({
		label: "mini map",
		actual: [doubled instanceof Vow, await miniWait(doubled)],
		expected: [true, 42],
	});
}

import { match, union } from "@/src/core/mini/exit.ts";
import { assertIsolated } from "@/src/core/mini/isolate.ts";
import type { Option } from "./core.ts";

export function expect<T>(self: Option<T>, message: string): T {
	assertIsolated(self, "Some", message);

	return union(self);
}

export function unwrap<T>(self: Option<T>): T {
	return expect(self, "Option unwrap failed!");
}

export function unwrapOr<T>(self: Option<T>, defaultValue: T): T {
	return match(self)({
		Some: (value) => value,
		None: () => defaultValue,
	});
}

import { match } from "@/src/core/mini/exit.ts";
import { Err, Ok, type Result } from "@/src/result/mini/core.ts";
import type { Option } from "./core.ts";

export function okOr<T, E>(self: Option<T>, err: E): Result<T, E> {
	return match(self)({
		Some: (value) => Ok(value),
		None: () => Err(err),
	});
}

export function okOrElse<T, E>(self: Option<T>, err: () => E): Result<T, E> {
	return match(self)({
		Some: (value) => Ok(value),
		None: () => Err(err()),
	});
}

import { Enum, type Split } from "@/src/core/mini/core.ts";

export function Ok<T = unknown, E = never>(value: T): Result<T, E> {
	return new Result<T, E>("Ok", value);
}

export function Err<T = never, E = unknown>(err: E): Result<T, E> {
	return new Result<T, E>("Err", err);
}

type Variants<T, E> = Split<{ Ok: [value: T]; Err: [err: E] }>;
export type { Variants as ResultVariants };

export class Result<out T, out E> extends Enum<Variants<T, E>> {}

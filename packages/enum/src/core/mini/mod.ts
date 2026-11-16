/**
 * Tree-shakable core of the enum framework: the {@linkcode Enum} class, its
 * variant types, and free functions to narrow (`isolate`, `eliminate`),
 * inspect and match an enum.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { Enum, match, type Split } from "@sekhmet/enum/core/mini";
 *
 * type Shape = Split<{ Circle: [radius: number]; Square: [side: number] }>;
 *
 * const area = (shape: Enum<Shape>): number =>
 *   match(shape)({
 *     Circle: (radius) => Math.PI * radius ** 2,
 *     Square: (side) => side ** 2,
 *   });
 *
 * assertEquals(area(new Enum<Shape>("Square", 3)), 9);
 * ```
 *
 * @module
 */

export * from "./core.ts";
export * from "./eliminate.ts";
export * from "./exit.ts";
export * from "./isolate.ts";

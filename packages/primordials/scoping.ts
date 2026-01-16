/**
 * Executes a function and returns its result.
 *
 * This utility provides a way to create expression-oriented blocks in TypeScript,
 * similar to Rust's block expressions or Kotlin's `run` function.
 *
 * @template T The return type of the block
 * @param run The function to execute
 * @returns The result of the function
 *
 * @example
 * ```ts
 * const result = block(() => {
 *   const a = 1;
 *   const b = 2;
 *   return a + b;
 * });
 * // result === 3
 * ```
 */
export function block<T>(run: () => T): T {
	return run();
}

/**
 * Identity function that returns its input unchanged.
 *
 * This utility is useful for creating inline definitions with explicit types,
 * or for satisfying type requirements where a value must be passed through
 * a function.
 *
 * @template T The type of the value
 * @param value The value to return
 * @returns The same value unchanged
 *
 * @example
 * ```ts
 * interface AppConfig { port: number; host: string }
 * const config = define<AppConfig>({
 *   port: 3000,
 *   host: "localhost"
 * });
 * ```
 */
export function define<T>(value: T): T {
	return value;
}

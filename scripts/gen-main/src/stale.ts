/**
 * Whether a checked-in generated file differs from freshly generated output.
 * A missing file is stale; line-ending differences are not.
 *
 * @param options.current - The checked-in contents, or `undefined` if the file is missing
 * @param options.generated - The freshly generated contents
 * @returns `true` if the file must be regenerated
 */
export function isStale({
	current,
	generated,
}: {
	current: string | undefined;
	generated: string;
}): boolean {
	if (current === undefined) return true;

	return (
		current.replaceAll("\r\n", "\n") !== generated.replaceAll("\r\n", "\n")
	);
}

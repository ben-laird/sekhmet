# Legacy

The register of retired patterns: code that predates a current rule. Each row
names the retired pattern, its replacement, and the issue tracking the
migration. New code follows the replacement even when its neighbors don't; code
you touch moves to it in a separate `refactor(scope): modernize …` commit. When
a rule changes, add a row here.

| Retired pattern                                                                                                    | Replacement                                                                                                               | Tracking                                                |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A package with no main/mini split returns mini values (`Option`, `Result`, `Outcome`, … from a `/mini` entrypoint) | Return the main form; it subclasses the mini one (patterns.md, "A package with no main/mini split hands out main values") | [#109](https://github.com/ben-laird/sekhmet/issues/109) |

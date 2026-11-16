/**
 * Tree-shakable core schema utilities.
 *
 * This module provides granular exports for the schema core functionality,
 * including the Potential type for async/sync handling and the Schema type
 * with all its manipulation functions.
 *
 * @module
 */

export {
	Custom,
	type CustomDetails,
	formatIssue,
	InvalidFormat,
	type InvalidFormatDetails,
	InvalidType,
	type InvalidTypeDetails,
	InvalidUnion,
	type InvalidUnionDetails,
	InvalidValue,
	type InvalidValueDetails,
	isSchemaIssue,
	type LimitOf,
	NotMultipleOf,
	type NotMultipleOfDetails,
	type Origin,
	SchemaIssue,
	type SchemaIssueVariants,
	TooBig,
	type TooBigDetails,
	TooSmall,
	type TooSmallDetails,
	type TypeName,
	typeName,
	UnknownKey,
	type UnknownKeyDetails,
} from "./issue.ts";

export {
	concat,
	entries,
	type Flatten,
	fromError,
	Issues,
	isIssues,
	issues,
	type Located,
	locate,
	type NonEmpty,
	prefix,
	toIssues,
} from "./issues.ts";

export {
	Async,
	from,
	type MaybePromise,
	map as mapPotential,
	Potential,
	type PotentialVariants,
	Sync,
} from "./potential.ts";

export {
	type AnySchema,
	type ErrorOf,
	filter,
	type Infer,
	type Input,
	map,
	mapErr,
	type Output,
	ParseError,
	type Parser,
	ParseSyncError,
	type ParseSyncErrorVariants,
	parse,
	parseAsync,
	parseSync,
	pipe,
	Schema,
	UnexpectedAsyncParse,
} from "./schema.ts";

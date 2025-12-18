# CLI Template

A minimal CLI application template with common patterns and examples.

## Structure

```txt
main.ts    - Entry point with async main() function
mod.ts     - Reusable library functions
deno.json  - Package configuration
```

## Common Patterns

### Argument Parsing

```typescript
import { parseArgs } from "@std/cli";

export async function main(): Promise<void> {
	const args = parseArgs(Deno.args, {
		string: ["name", "output"],
		boolean: ["verbose", "help"],
		alias: {
			n: "name",
			o: "output",
			v: "verbose",
			h: "help",
		},
		default: {
			verbose: false,
		},
	});

	if (args.help) {
		console.log("Usage: deno run main.ts [options]");
		Deno.exit(0);
	}

	// Your logic here
}
```

### Colored Output

```typescript
import { bold, green, red, yellow } from "@std/fmt/colors";

console.log(green("✓ Success message"));
console.error(red("✗ Error message"));
console.log(yellow("⚠ Warning message"));
console.log(bold("Important information"));
```

### File System Operations

```typescript
import { ensureDir, exists } from "@std/fs";
import { join } from "@std/path";

// Check if file exists
if (await exists("./path/to/file.txt")) {
	// File exists
}

// Create directory if it doesn't exist
await ensureDir("./path/to/dir");

// Read file
const content = await Deno.readTextFile("./file.txt");

// Write file
await Deno.writeTextFile("./output.txt", content);
```

### Error Handling

```typescript
export async function main(): Promise<void> {
	try {
		// Your logic
	} catch (error) {
		console.error(
			red(`Error: ${error instanceof Error ? error.message : error}`),
		);
		Deno.exit(1);
	}
}
```

## Examples

See the existing sekhmet scripts for complete examples:

- `@sekhmet/add` - Template scaffolding with arg parsing, colors, and file operations
- `@sekhmet/ci` - CI runner with command execution and error handling

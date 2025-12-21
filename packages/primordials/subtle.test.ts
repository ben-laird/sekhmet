import { AssertionError, assertInstanceOf } from "@std/assert";
import { Subtle, useSubtle } from "./subtle.ts";

Deno.test("Subtle usage", async (t) => {
	// Given

	interface CounterTransactionController {
		get(): number;
		set(count: number): void;
	}

	class CounterTransaction {
		constructor(ctrl: CounterTransactionController) {
			this.#ctrl = ctrl;
			this.transactionCount = ctrl.get();
		}

		#ctrl: CounterTransactionController;

		get counterCount(): number {
			return this.#ctrl.get();
		}

		transactionCount: number;

		commit(): void {
			this.#ctrl.set(this.transactionCount);
		}
	}

	class Counter extends Subtle<CounterTransaction> {
		constructor(start = 0) {
			super({
				create: () => {
					return new CounterTransaction({
						get: () => this.#count,
						set: (count) => {
							this.#count = count;
						},
					});
				},
			});

			this.#count = start;
		}

		#count: number;

		get count() {
			return this.#count;
		}
	}

	const counter = new Counter();

	await t.step("Subtle instances allow access to special code", () => {
		// When

		const transaction = useSubtle(counter);

		// Then

		assertInstanceOf(transaction, CounterTransaction);
	});

	await t.step(
		"Subtle provides privileged access to modify private state",
		() => {
			// Given: Counter has private #count that's read-only from outside
			const initialCount = counter.count;

			// When: Using subtle access to get a controller that can modify it
			const transaction = useSubtle(counter);
			transaction.transactionCount = 42;
			transaction.commit();

			// Then: The private state was modified despite no public setter
			if (counter.count !== 42) {
				throw new AssertionError(
					"Subtle access should allow modifying private state",
				);
			}
			if (initialCount === 42) {
				throw new AssertionError("Initial count should have been different");
			}
		},
	);

	await t.step(
		"Subtle bypasses normal encapsulation to read private state",
		() => {
			// Given: Counter's #count is private with no direct access
			const transaction = useSubtle(counter);

			// When: Reading through the subtle transaction controller
			const privateCount = transaction.counterCount;

			// Then: We can read the private #count field indirectly
			if (privateCount !== counter.count) {
				throw new AssertionError(
					"Subtle should provide access to read private state",
				);
			}
		},
	);

	await t.step(
		"Each subtle invocation creates independent privileged contexts",
		() => {
			// Given: Multiple subtle accesses to the same object
			const tx1 = useSubtle(counter);
			const tx2 = useSubtle(counter);

			// When: Each transaction modifies its own state
			tx1.transactionCount = 100;
			tx2.transactionCount = 200;

			// Then: Each has independent state despite accessing same object
			if (tx1.transactionCount === tx2.transactionCount) {
				throw new AssertionError(
					"Each subtle invocation should create independent state",
				);
			}
			if (tx1.counterCount !== tx2.counterCount) {
				throw new AssertionError(
					"But both should see the same underlying private state",
				);
			}
		},
	);

	await t.step(
		"Subtle controller can perform operations impossible through public API",
		() => {
			// Given: No public method to set counter directly
			const targetValue = 999;

			// When: Using subtle to directly set the value
			const transaction = useSubtle(counter);
			transaction.transactionCount = targetValue;
			transaction.commit();

			// Then: Private state modified without any public setter method
			if (counter.count !== targetValue) {
				throw new AssertionError(
					"Subtle should enable operations not in public API",
				);
			}
		},
	);
});

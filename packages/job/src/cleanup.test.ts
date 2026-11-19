import { Panic } from "@sekhmet/panic/mini/core";
import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
	assertThrows,
} from "@std/assert";
import {
	cleanupStack,
	LocalSuppressedError,
	suppressedError,
} from "@/src/cleanup.ts";

Deno.test("dispose runs every registration once, last in first out", async () => {
	// Given: a stack with a defer, an adopt and a use, in that order
	const order: string[] = [];
	const { cleanup, dispose } = cleanupStack();
	cleanup.defer(() => {
		order.push("defer");
	});
	const adopted = cleanup.adopt("conn", (value) => {
		order.push(`adopt ${value}`);
	});
	cleanup.use({
		[Symbol.dispose]: () => {
			order.push("use");
		},
	});

	// When: it is disposed twice
	const first = await dispose(undefined);
	const second = await dispose(undefined);

	// Then: each ran once, in reverse order, and nothing threw
	assertEquals(adopted, "conn");
	assertEquals(order, ["use", "adopt conn", "defer"]);
	assertEquals(first, undefined);
	assertEquals(second, undefined);
});

Deno.test("dispose awaits each async disposal before the next", async () => {
	// Given: an async defer registered before a sync one
	const order: string[] = [];
	const { cleanup, dispose } = cleanupStack();
	cleanup.defer(async () => {
		await Promise.resolve();
		order.push("first registered");
	});
	cleanup.defer(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		order.push("last registered");
	});

	// When: it is disposed
	await dispose(undefined);

	// Then: the slow, later one finished before the earlier one started
	assertEquals(order, ["last registered", "first registered"]);
});

Deno.test("use disposes resources as AsyncDisposableStack does", async (t) => {
	await t.step("an async disposable is awaited", async () => {
		// Given: a resource with Symbol.asyncDispose
		const disposed: string[] = [];
		const { cleanup, dispose } = cleanupStack();
		const resource = {
			[Symbol.asyncDispose]: async () => {
				await Promise.resolve();
				disposed.push("async");
			},
		};

		// When: it is used, then the stack disposed
		const used = cleanup.use(resource);
		await dispose(undefined);

		// Then: the same value came back, and its async dispose ran
		assertStrictEquals(used, resource);
		assertEquals(disposed, ["async"]);
	});

	await t.step("an async dispose wins over a sync one", async () => {
		// Given: a resource with both methods
		const disposed: string[] = [];
		const { cleanup, dispose } = cleanupStack();
		cleanup.use({
			[Symbol.asyncDispose]: () => {
				disposed.push("async");
				return Promise.resolve();
			},
			[Symbol.dispose]: () => {
				disposed.push("sync");
			},
		});

		// When: the stack is disposed
		await dispose(undefined);

		// Then: only the async one ran
		assertEquals(disposed, ["async"]);
	});

	await t.step("null and undefined pass through", async () => {
		// Given: an empty stack
		const { cleanup, dispose } = cleanupStack();

		// When: null and undefined are used, then the stack disposed
		const none = cleanup.use(null);
		const missing = cleanup.use(undefined);
		const thrown = await dispose(undefined);

		// Then: they came back as they were, and disposal had nothing to do
		assertEquals(none, null);
		assertEquals(missing, undefined);
		assertEquals(thrown, undefined);
	});

	await t.step("a value with no dispose method panics", () => {
		// Given: an empty stack
		const { cleanup } = cleanupStack();

		// When: an untyped caller uses a plain object
		const misuse = (): unknown => Reflect.apply(cleanup.use, cleanup, [{}]);

		// Then: it panics
		const error = assertThrows(misuse, Panic);
		assertEquals(error.name, "Panic (NotDisposable)");
	});
});

Deno.test("registering once disposal started panics", async (t) => {
	await t.step("after disposal", async () => {
		// Given: a disposed stack
		const { cleanup, dispose } = cleanupStack();
		await dispose(undefined);

		// When: each method is called
		// Then: each panics
		for (const register of [
			() => cleanup.defer(() => {}),
			() => cleanup.use(null),
			() => cleanup.adopt(1, () => {}),
		]) {
			const error = assertThrows(register, Panic);
			assertEquals(error.name, "Panic (CleanupAfterDispose)");
		}
	});

	await t.step("from inside a disposal", async () => {
		// Given: a defer that registers another while being disposed
		const { cleanup, dispose } = cleanupStack();
		cleanup.defer(() => {
			cleanup.defer(() => {});
		});

		// When: the stack is disposed
		const thrown = await dispose(undefined);

		// Then: the late registration panicked, and disposal kept that panic
		assertInstanceOf(thrown?.error, Panic);
		assertEquals(thrown.error.name, "Panic (CleanupAfterDispose)");
	});
});

Deno.test("disposal errors compose as SuppressedError does", async (t) => {
	await t.step("one throw, with no prior error, is kept as is", async () => {
		// Given: a disposal that throws, and others around it
		const boom = new Error("close failed");
		const disposed: string[] = [];
		const { cleanup, dispose } = cleanupStack();
		cleanup.defer(() => {
			disposed.push("first registered");
		});
		cleanup.defer(() => {
			throw boom;
		});

		// When: the stack is disposed
		const thrown = await dispose(undefined);

		// Then: the error is the throw itself, and later disposals still ran
		assertStrictEquals(thrown?.error, boom);
		assertEquals(disposed, ["first registered"]);
	});

	await t.step("no throw leaves the prior error untouched", async () => {
		// Given: a stack whose disposals succeed, and a prior error
		const { cleanup, dispose } = cleanupStack();
		cleanup.defer(() => {});
		const prior = { error: new Error("body broke") };

		// When: it is disposed with that error
		const thrown = await dispose(prior);

		// Then: the very same value comes back
		assertStrictEquals(thrown, prior);
	});

	await t.step("a throw suppresses the prior error", async () => {
		// Given: a throwing disposal, and a prior error
		const body = new Error("body broke");
		const close = new Error("close failed");
		const { cleanup, dispose } = cleanupStack();
		cleanup.defer(() => {
			throw close;
		});

		// When: it is disposed with that error
		const thrown = await dispose({ error: body });

		// Then: the disposal's error suppresses the body's
		assertInstanceOf(thrown?.error, SuppressedError);
		assertStrictEquals(thrown.error.error, close);
		assertStrictEquals(thrown.error.suppressed, body);
	});

	await t.step("several throws chain, the last outermost", async () => {
		// Given: two throwing disposals
		const first = new Error("registered first");
		const last = new Error("registered last");
		const { cleanup, dispose } = cleanupStack();
		cleanup.defer(() => {
			throw first;
		});
		cleanup.defer(() => {
			throw last;
		});

		// When: the stack is disposed
		const thrown = await dispose(undefined);

		// Then: the one disposed last (registered first) suppresses the other
		assertInstanceOf(thrown?.error, SuppressedError);
		assertStrictEquals(thrown.error.error, first);
		assertStrictEquals(thrown.error.suppressed, last);
	});
});

Deno.test("suppressedError falls back to a local class of the same shape", () => {
	// Given: an error and the earlier one it suppresses
	const error = new Error("cleanup");
	const suppressed = new Error("body");

	// When: they compose without a native SuppressedError
	const local = suppressedError({ error, suppressed, native: undefined });

	// Then: it has SuppressedError's name, error and suppressed
	assertInstanceOf(local, LocalSuppressedError);
	assertInstanceOf(local, Error);
	assertEquals(local.name, "SuppressedError");
	assertStrictEquals(local.error, error);
	assertStrictEquals(local.suppressed, suppressed);
	assert(!(local instanceof SuppressedError));
});

type JobResults<T extends Job<unknown>[]> = {
	[K in keyof T]: T[K] extends Job<infer R> ? R : never;
};

type Job<T> = {
	readonly name: string;
	run(): RunHandle<T>;
};

type RunHandle<T> = {
	promise(): Promise<T>;
	abort(): void;
};

type JobContext<M> = {
	needs<const T extends Job<unknown>[]>(jobs: T): Promise<JobResults<T>>;
	signal: AbortSignal;
	meta: M;
};

type JobFn<T, M> = (ctx: JobContext<M>) => T | Promise<T>;

class JobEnv<M> {
	constructor(meta: M) {
		this.#meta = meta;
	}

	#meta: M;

	#runWithCache<R>(
		job: Job<R>,
		cache: Map<Job<unknown>, RunHandle<unknown>>,
		parentCtrl: AbortController,
	): RunHandle<R> {
		const existing = cache.get(job) as RunHandle<R> | undefined;
		if (existing) return existing;

		const handle = job.run();
		cache.set(job, handle);

		parentCtrl.signal.addEventListener("abort", () => handle.abort(), {
			once: true,
		});

		return handle;
	}

	job<T>(name: string, run: JobFn<T, M>): Job<T> {
		return {
			name,
			run: () => {
				const cache = new Map<Job<unknown>, RunHandle<unknown>>();
				const ctrl = new AbortController();

				const result = run({
					meta: this.#meta,
					signal: ctrl.signal,
					needs: (jobs) => {
						return Promise.all(
							jobs.map((job) => {
								return this.#runWithCache(job, cache, ctrl).promise();
							}) as JobResults<typeof jobs>,
						);
					},
				});

				return {
					abort: () => {
						ctrl.abort();
					},
					promise: () => Promise.resolve(result),
				};
			},
		};
	}
}

Deno.test("add() adds two numbers", async () => {
	const env = new JobEnv({ logger: console });
	const job = env.job;

	const readVersion = job("read-version", (ctx) => {
		ctx.meta.logger.info("reading version...");

		return "1.0.0";
	});

	const ci = job("ci", async (ctx) => {
		ctx.meta.logger.info("Running CI...");

		const [version] = await ctx.needs([readVersion]);
	});

	await ci.run().promise();
});

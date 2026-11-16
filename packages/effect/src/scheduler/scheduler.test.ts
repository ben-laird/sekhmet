import { match } from "@sekhmet/enum/core/mini/exit";
import { assertEquals } from "@std/assert";
import { Scheduler } from "./scheduler.ts";

Deno.test("scheduler state is Idle on construction", () => {
	// Given: a newly created scheduler
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: we inspect its state
	const { state } = scheduler;

	// Then: the state should be Idle
	match(state)({
		Idle: () => {
			/* Expected */
		},
		Scheduled: () => {
			throw new Error("Expected Idle, got Scheduled");
		},
		Running: () => {
			throw new Error("Expected Idle, got Running");
		},
	});
});

Deno.test("scheduler runs a single task synchronously", () => {
	// Given: a synchronous scheduler and a counter
	let ran = 0;
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: a single task is enqueued
	scheduler.run(() => {
		ran++;
	});

	// Then: the task runs immediately (sync scheduler)
	assertEquals(ran, 1);
});

Deno.test("scheduler state returns to Idle after synchronous drain", () => {
	// Given: a synchronous scheduler
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: a task is enqueued and completes
	scheduler.run(() => {});

	// Then: state should be Idle again
	match(scheduler.state)({
		Idle: () => {
			/* Expected */
		},
		Scheduled: () => {
			throw new Error("Expected Idle, got Scheduled");
		},
		Running: () => {
			throw new Error("Expected Idle, got Running");
		},
	});
});

Deno.test("scheduler state is Running when observed from within a task", () => {
	// Given: a synchronous scheduler
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });
	let stateWhileRunning: string | undefined;

	// When: a task checks the scheduler state during execution
	scheduler.run(() => {
		match(scheduler.state)({
			Running: () => {
				stateWhileRunning = "Running";
			},
			Idle: () => {
				stateWhileRunning = "Idle";
			},
			Scheduled: () => {
				stateWhileRunning = "Scheduled";
			},
		});
	});

	// Then: the state observed from within the task was Running
	assertEquals(stateWhileRunning, "Running");
});

Deno.test("scheduler runs tasks in FIFO order", () => {
	// Given: a synchronous scheduler and an order-tracking array
	const order: number[] = [];
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: three tasks are enqueued
	scheduler.run(() => {
		order.push(1);
	});
	scheduler.run(() => {
		order.push(2);
	});
	scheduler.run(() => {
		order.push(3);
	});

	// Then: tasks execute in the order they were enqueued
	assertEquals(order, [1, 2, 3]);
});

Deno.test("scheduler handles tasks that enqueue more tasks", () => {
	// Given: a synchronous scheduler
	const results: number[] = [];
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: a task enqueues another task during its own execution
	scheduler.run(() => {
		results.push(1);
		scheduler.run(() => {
			results.push(2);
		});
	});

	// Then: both the parent and child tasks run
	assertEquals(results, [1, 2]);
});

Deno.test("scheduler does not double-schedule when tasks enqueue more tasks", () => {
	// Given: a synchronous scheduler that counts how many times schedule() is called
	let scheduleCalls = 0;
	const scheduler = new Scheduler({
		schedule: (runStep) => {
			scheduleCalls++;
			runStep();
		},
	});

	// When: a task enqueues two more tasks during execution
	scheduler.run(() => {
		scheduler.run(() => {});
		scheduler.run(() => {});
	});

	// Then: schedule() was called twice — once for the seed task, once for the two
	// tasks enqueued during its execution (splice snapshots the queue before running,
	// so inner enqueues land in the next turn, not the current one)
	assertEquals(scheduleCalls, 2);
});

Deno.test("scheduler uses default step budget and completes all tasks", () => {
	// Given: a synchronous scheduler with no explicit stepBudget (default 128)
	let count = 0;
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: 200 tasks are enqueued (more than the default budget of 128)
	for (let i = 0; i < 200; i++) {
		scheduler.run(() => {
			count++;
		});
	}

	// Then: all tasks complete (synchronous scheduler processes across multiple turns)
	assertEquals(count, 200);
});

Deno.test("scheduler respects step budget with synchronous scheduler", () => {
	// Given: a synchronous scheduler with a budget of 3 and a schedule-call counter
	let scheduleCalls = 0;
	const order: number[] = [];
	const scheduler = new Scheduler({
		schedule: (runStep) => {
			scheduleCalls++;
			runStep();
		},
		stepBudget: 3,
	});

	// When: 7 tasks are enqueued from within a single initial task
	// (so all 7 are in the queue before the drain begins processing them)
	scheduler.run(() => {
		for (let i = 1; i <= 7; i++) {
			scheduler.run(() => {
				order.push(i);
			});
		}
	});

	// Then: all 7 tasks run in order
	assertEquals(order, [1, 2, 3, 4, 5, 6, 7]);
	// And: splice snapshots the queue at the start of each turn, so the seed task
	// runs alone in turn 1 (budget 3, but only 1 task in queue), enqueuing 7 tasks.
	// turn 1: seed (1 step), turn 2: tasks 1,2,3 (3 steps), turn 3: tasks 4,5,6 (3 steps), turn 4: task 7 (1 step)
	// = 4 schedule calls total
	assertEquals(scheduleCalls, 4);
});

Deno.test("scheduler does not run tasks until dispatch with async scheduler", async () => {
	// Given: a macrotask scheduler
	let ran = false;
	const scheduler = new Scheduler({
		schedule: (runStep) => setTimeout(runStep, 0),
	});

	// When: a task is enqueued
	scheduler.run(() => {
		ran = true;
	});

	// Then: the task has NOT run synchronously
	assertEquals(ran, false);

	// Then: state is Scheduled (waiting for dispatch)
	match(scheduler.state)({
		Scheduled: () => {
			/* Expected */
		},
		Idle: () => {
			throw new Error("Expected Scheduled, got Idle");
		},
		Running: () => {
			throw new Error("Expected Scheduled, got Running");
		},
	});

	// When: we wait for the macrotask to fire
	await new Promise<void>((resolve) => setTimeout(resolve, 10));

	// Then: the task has now run
	assertEquals(ran, true);
});

Deno.test("scheduler state is Idle after async drain completes", async () => {
	// Given: a microtask scheduler
	const scheduler = new Scheduler({ schedule: queueMicrotask });

	// When: tasks are enqueued and the microtask queue is flushed
	scheduler.run(() => {});
	scheduler.run(() => {});

	await new Promise<void>((resolve) => queueMicrotask(resolve));
	// Extra flush to ensure drain has completed
	await new Promise<void>((resolve) => queueMicrotask(resolve));

	// Then: state is Idle
	match(scheduler.state)({
		Idle: () => {
			/* Expected */
		},
		Scheduled: () => {
			throw new Error("Expected Idle, got Scheduled");
		},
		Running: () => {
			throw new Error("Expected Idle, got Running");
		},
	});
});

Deno.test("scheduler calls the scheduling function without a receiver", () => {
	// Given: a scheduling function that records its `this`
	const receivers: unknown[] = [];
	const scheduler = new Scheduler({
		schedule: function (this: unknown, runStep) {
			receivers.push(this);
			runStep();
		},
	});

	// When: a task is enqueued
	scheduler.run(() => {});

	// Then: it was called as a plain function, as a host function like
	// workerd's queueMicrotask requires
	assertEquals(receivers, [undefined]);
});

Deno.test("scheduler is reusable after a turn fully drains", () => {
	// Given: a synchronous scheduler that has already drained a batch
	const results: string[] = [];
	const scheduler = new Scheduler({ schedule: (runStep) => runStep() });

	// When: a first batch of tasks runs and completes
	scheduler.run(() => {
		results.push("a");
	});
	scheduler.run(() => {
		results.push("b");
	});

	// Then: first batch completed and state is Idle
	assertEquals(results, ["a", "b"]);
	match(scheduler.state)({
		Idle: () => {
			/* Expected */
		},
		Scheduled: () => {
			throw new Error("Expected Idle");
		},
		Running: () => {
			throw new Error("Expected Idle");
		},
	});

	// When: a second batch is enqueued after the first completes
	scheduler.run(() => {
		results.push("c");
	});

	// Then: the second batch also runs correctly
	assertEquals(results, ["a", "b", "c"]);
});

Deno.test("scheduler with synchronous schedule does not overflow for large task chains", () => {
	// Given: a synchronous scheduler and a chain of 10,000 tasks (trampoline stress test)
	const TASK_COUNT = 10_000;
	let completedTasks = 0;
	const scheduler = new Scheduler({
		schedule: (runStep) => runStep(),
		stepBudget: 128,
	});

	// When: TASK_COUNT tasks are chained (each enqueues the next)
	function enqueueNext(i: number): void {
		if (i > TASK_COUNT) return;
		scheduler.run(() => {
			completedTasks++;
			enqueueNext(i + 1);
		});
	}
	enqueueNext(1);

	// Then: all tasks complete without a stack overflow
	assertEquals(completedTasks, TASK_COUNT);
});

Deno.test("scheduler enforces budget across multiple async turns", async () => {
	// Given: a microtask scheduler with a budget of 2
	const order: number[] = [];
	let turnCount = 0;
	const scheduler = new Scheduler({
		schedule: (runStep) =>
			queueMicrotask(() => {
				turnCount++;
				runStep();
			}),
		stepBudget: 2,
	});

	// When: 5 tasks are enqueued from within a seed task so all 5 are in the queue
	// before the drain begins processing them
	scheduler.run(() => {
		for (let i = 1; i <= 5; i++) {
			scheduler.run(() => {
				order.push(i);
			});
		}
	});

	// Flush all pending microtasks by waiting for several macrotask ticks
	await new Promise<void>((resolve) => setTimeout(resolve, 50));

	// Then: all tasks ran in order
	assertEquals(order, [1, 2, 3, 4, 5]);
	// And: the seed + 5 tasks = 6 total, budget 2 per turn:
	// turn 1: seed task + task 1 (2 steps), turn 2: tasks 2,3, turn 3: tasks 4,5
	// = at least ceil(6/2) = 3 turns
	assertEquals(turnCount >= 3, true);
});

Deno.test("schedule context has correct turnIndex on each call", () => {
	// Given: a synchronous scheduler that records turnIndex from each context
	const turnIndices: number[] = [];
	const scheduler = new Scheduler({
		schedule: (runStep, context) => {
			turnIndices.push(context.turnIndex);
			runStep();
		},
		stepBudget: 1,
	});

	// When: 3 tasks are enqueued from a seed task (budget 1 forces a new turn per task)
	scheduler.run(() => {
		scheduler.run(() => {});
		scheduler.run(() => {});
	});

	// Then: turnIndex increments with each scheduling call
	// turn 0: seed task, turn 1: task 1, turn 2: task 2
	assertEquals(turnIndices, [0, 1, 2]);
});

Deno.test("schedule context reports correct queueDepth", () => {
	// Given: a synchronous scheduler that records queueDepth at dispatch time
	const depths: number[] = [];
	const scheduler = new Scheduler({
		schedule: (runStep, context) => {
			depths.push(context.queueDepth);
			runStep();
		},
		stepBudget: 128,
	});

	// When: 3 tasks are enqueued before the first dispatch fires
	// The seed task enqueues 3 more tasks; all 3 are in the queue when schedule() is first called
	scheduler.run(() => {
		scheduler.run(() => {});
		scheduler.run(() => {});
		scheduler.run(() => {});
	});

	// Then: first dispatch sees queueDepth=1 (just the seed task).
	// splice snapshots 1 task; seed runs and enqueues 3 more. Queue now has 3 items,
	// triggering a second dispatch with queueDepth=3. Budget covers the remaining 3.
	assertEquals(depths, [1, 3]);
});

Deno.test("schedule context reports correct stepsLastTurn", () => {
	// Given: a synchronous scheduler with budget 2 that records stepsLastTurn
	const stepsRecorded: number[] = [];
	const scheduler = new Scheduler({
		schedule: (runStep, context) => {
			stepsRecorded.push(context.stepsLastTurn);
			runStep();
		},
		stepBudget: 2,
	});

	// When: a seed task enqueues 4 more tasks (5 total, budget 2 per turn)
	scheduler.run(() => {
		scheduler.run(() => {});
		scheduler.run(() => {});
		scheduler.run(() => {});
		scheduler.run(() => {});
	});

	// Then: first call has stepsLastTurn=0 (no prior turn).
	// splice snapshots the queue at the start of each turn: seed task is alone in turn 1 (1 step),
	// then its 4 enqueued tasks are processed two per turn (budget=2).
	// second call has stepsLastTurn=1 (only the seed ran in turn 1)
	assertEquals(stepsRecorded[0], 0);
	assertEquals(stepsRecorded[1], 1);
});

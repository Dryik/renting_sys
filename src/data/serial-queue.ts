/**
 * Runs tasks one at a time, in the order they were submitted.
 *
 * Session transitions can overlap in practice — a lock timer firing while a
 * logout click is in flight, a restore landing beside a refresh. Interleaved,
 * two transitions could read the same epoch and both publish it, or the slower
 * one could finish last and reinstate a session the user has already left.
 *
 * Serializing removes both: each task sees what the previous one left behind,
 * and the last task submitted is the last to publish.
 */
export type SerialQueue = {
  /** Submits a task and resolves with its result once earlier tasks finish. */
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      // `then(task, task)` rather than `then(task)`: a rejected predecessor
      // must not skip this task, only be prevented from stopping it.
      const result = tail.then(task, task);

      // The tail swallows outcomes so one failure cannot wedge the queue for
      // every transition after it.
      tail = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
}

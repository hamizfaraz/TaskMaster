import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A deadline shared by every step of one generation run.
 *
 * Retries need to know the clock. Note generation is four sequential model
 * calls, each allowed to retry a transient failure, and the backoff honours a
 * delay the provider names — up to 60 seconds. Counted per step that is
 * bounded; counted across the request it is not: four steps waiting twice each
 * can exceed the route's `maxDuration`, at which point the platform kills the
 * handler and the caller gets nothing rather than an error it can act on.
 *
 * An ambient deadline rather than a parameter threaded through four exported
 * functions, because those functions are also called on their own — `embedNote`
 * uses `embedGeneratedTopics` directly — and should keep working with no
 * deadline in force.
 */
const store = new AsyncLocalStorage<number>();

/** Run `fn` with `budgetMs` to work in. Nested calls keep the outer deadline. */
export function withDeadline<T>(budgetMs: number, fn: () => Promise<T>): Promise<T> {
  const existing = store.getStore();
  if (existing !== undefined) return fn();
  return store.run(Date.now() + budgetMs, fn);
}

/** Milliseconds left, or null when nothing has set a deadline. */
export function remainingMs(): number | null {
  const deadline = store.getStore();
  return deadline === undefined ? null : deadline - Date.now();
}

/**
 * Is there time to wait `delayMs` and still have `workMs` to do something after?
 *
 * Without the second term a retry could be scheduled inside the budget and then
 * be killed mid-flight, which spends the wait and returns nothing.
 */
export function hasTimeFor(delayMs: number, workMs: number): boolean {
  const left = remainingMs();
  return left === null || left > delayMs + workMs;
}

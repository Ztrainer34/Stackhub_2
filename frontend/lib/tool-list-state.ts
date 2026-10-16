import { Tool } from "./tool";

/**
 * How a tool's list membership changes when you act on it.
 *
 * These mirror what the Go handlers do inside a transaction — see `addToStack`,
 * `addToWatchlist` and `addToOldStack` in `backend/cmd/server/main.go`. They
 * exist separately so the optimistic update in the UI can show the same result
 * immediately, without waiting for a round trip.
 *
 * Keeping them here rather than inline in each mutation means the rules are
 * written once. Copy-pasted into three `setQueryData` callbacks they drift, and
 * a drift shows the user one thing while the database holds another — a bug
 * that "fixes itself" on refresh, which makes it very hard to catch.
 *
 * **If you change one of these, change the matching Go handler too.**
 *
 * The rules:
 *   - A tool is in at most one of stack / watchlist / old stack.
 *   - Stack and watchlist both follow the tool: using it, or saving it for
 *     later, means wanting its updates.
 *   - The old stack unfollows: you have stopped using it. This is the only
 *     place a follow is removed automatically.
 */

/** The fields these transforms touch. Anything else on the tool is preserved. */
type ToolListState = Pick<
  Tool,
  "is_in_stack" | "is_in_watchlist" | "is_in_old_stack" | "is_followed"
>;

export function applyAddToStack<T extends Partial<ToolListState>>(tool: T): T {
  return {
    ...tool,
    is_in_stack: true,
    is_in_watchlist: false,
    is_in_old_stack: false,
    is_followed: true,
  };
}

export function applyAddToWatchlist<T extends Partial<ToolListState>>(tool: T): T {
  return {
    ...tool,
    is_in_stack: false,
    is_in_watchlist: true,
    is_in_old_stack: false,
    is_followed: true,
  };
}

export function applyAddToOldStack<T extends Partial<ToolListState>>(tool: T): T {
  return {
    ...tool,
    is_in_stack: false,
    is_in_watchlist: false,
    is_in_old_stack: true,
    is_followed: false,
  };
}

/**
 * Removing a tool from one list does NOT change the others, and does not
 * unfollow — only archiving does that. Taking something out of your stack
 * leaves you following it until you say otherwise.
 */
export function applyRemoveFromStack<T extends Partial<ToolListState>>(tool: T): T {
  return { ...tool, is_in_stack: false };
}

export function applyRemoveFromWatchlist<T extends Partial<ToolListState>>(tool: T): T {
  return { ...tool, is_in_watchlist: false };
}

export function applyRemoveFromOldStack<T extends Partial<ToolListState>>(tool: T): T {
  return { ...tool, is_in_old_stack: false };
}

import { describe, it, expect } from "vitest";
import {
  applyAddToStack,
  applyAddToWatchlist,
  applyAddToOldStack,
  applyRemoveFromStack,
  applyRemoveFromWatchlist,
  applyRemoveFromOldStack,
} from "@/lib/tool-list-state";

/**
 * A tool sits in at most one of stack / watchlist / old stack, and can
 * separately be followed. These mirror the Go handlers in
 * backend/cmd/server/main.go so the optimistic UI update matches what the
 * database ends up holding — see the module doc comment for the full
 * rationale. If these and the Go handlers drift, the bug "fixes itself" on
 * refresh, which makes it very hard to catch, so the rules are pinned here
 * per-flag rather than via one broad snapshot.
 */

// A tool not on any list and not followed - a fresh, never-interacted-with tool.
function baseTool() {
  return {
    id: "tool-1",
    name: "Clay",
    is_in_stack: false,
    is_in_watchlist: false,
    is_in_old_stack: false,
    is_followed: false,
  };
}

describe("applyAddToStack", () => {
  it("puts the tool in the stack and only the stack", () => {
    const result = applyAddToStack(baseTool());

    expect(result.is_in_stack).toBe(true);
    expect(result.is_in_watchlist).toBe(false);
    expect(result.is_in_old_stack).toBe(false);
  });

  it("follows the tool", () => {
    // Using a tool means wanting its updates.
    expect(applyAddToStack(baseTool()).is_followed).toBe(true);
  });

  it("moves a watchlisted tool into the stack, clearing the watchlist flag", () => {
    const watchlisted = { ...baseTool(), is_in_watchlist: true, is_followed: true };

    const result = applyAddToStack(watchlisted);

    expect(result.is_in_stack).toBe(true);
    expect(result.is_in_watchlist).toBe(false);
    expect(result.is_followed).toBe(true);
  });

  it("moves an archived tool back into the stack, clearing old stack and re-following", () => {
    const archived = { ...baseTool(), is_in_old_stack: true, is_followed: false };

    const result = applyAddToStack(archived);

    expect(result.is_in_stack).toBe(true);
    expect(result.is_in_old_stack).toBe(false);
    expect(result.is_followed).toBe(true);
  });

  it("preserves unrelated properties", () => {
    const result = applyAddToStack(baseTool());

    expect(result.id).toBe("tool-1");
    expect(result.name).toBe("Clay");
  });

  it("does not mutate the input", () => {
    const input = baseTool();
    const before = { ...input };

    applyAddToStack(input);

    expect(input).toEqual(before);
  });
});

describe("applyAddToWatchlist", () => {
  it("puts the tool in the watchlist and only the watchlist", () => {
    const result = applyAddToWatchlist(baseTool());

    expect(result.is_in_watchlist).toBe(true);
    expect(result.is_in_stack).toBe(false);
    expect(result.is_in_old_stack).toBe(false);
  });

  it("follows the tool", () => {
    // Saving a tool for later still means wanting its updates.
    expect(applyAddToWatchlist(baseTool()).is_followed).toBe(true);
  });

  it("moves a stacked tool into the watchlist, clearing the stack flag", () => {
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: true };

    const result = applyAddToWatchlist(stacked);

    expect(result.is_in_watchlist).toBe(true);
    expect(result.is_in_stack).toBe(false);
    expect(result.is_followed).toBe(true);
  });

  it("moves an archived tool into the watchlist, re-following it", () => {
    const archived = { ...baseTool(), is_in_old_stack: true, is_followed: false };

    const result = applyAddToWatchlist(archived);

    expect(result.is_in_watchlist).toBe(true);
    expect(result.is_in_old_stack).toBe(false);
    expect(result.is_followed).toBe(true);
  });

  it("preserves unrelated properties", () => {
    const result = applyAddToWatchlist(baseTool());

    expect(result.id).toBe("tool-1");
    expect(result.name).toBe("Clay");
  });

  it("does not mutate the input", () => {
    const input = baseTool();
    const before = { ...input };

    applyAddToWatchlist(input);

    expect(input).toEqual(before);
  });
});

describe("applyAddToOldStack", () => {
  it("puts the tool in the old stack and only the old stack", () => {
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: true };

    const result = applyAddToOldStack(stacked);

    expect(result.is_in_old_stack).toBe(true);
    expect(result.is_in_stack).toBe(false);
    expect(result.is_in_watchlist).toBe(false);
  });

  it("unfollows the tool, unlike the other two add functions", () => {
    // This is the only automatic unfollow in the product - the case most
    // likely to be "simplified" away by someone matching it to its siblings.
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: true };

    expect(applyAddToOldStack(stacked).is_followed).toBe(false);
  });

  it("unfollows even a watchlisted tool moved to the old stack", () => {
    const watchlisted = { ...baseTool(), is_in_watchlist: true, is_followed: true };

    const result = applyAddToOldStack(watchlisted);

    expect(result.is_in_old_stack).toBe(true);
    expect(result.is_in_watchlist).toBe(false);
    expect(result.is_followed).toBe(false);
  });

  it("preserves unrelated properties", () => {
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: true };

    const result = applyAddToOldStack(stacked);

    expect(result.id).toBe("tool-1");
    expect(result.name).toBe("Clay");
  });

  it("does not mutate the input", () => {
    const input = { ...baseTool(), is_in_stack: true, is_followed: true };
    const before = { ...input };

    applyAddToOldStack(input);

    expect(input).toEqual(before);
  });
});

describe("applyRemoveFromStack", () => {
  it("clears only the stack flag", () => {
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: true };

    const result = applyRemoveFromStack(stacked);

    expect(result.is_in_stack).toBe(false);
  });

  it("does not touch the other lists", () => {
    // A tool shouldn't logically be in two lists at once, but the function's
    // contract is that it only ever clears its own flag - this proves it isn't
    // also resetting the others as a side effect.
    const weirdState = {
      ...baseTool(),
      is_in_stack: true,
      is_in_watchlist: true,
      is_in_old_stack: true,
    };

    const result = applyRemoveFromStack(weirdState);

    expect(result.is_in_watchlist).toBe(true);
    expect(result.is_in_old_stack).toBe(true);
  });

  it("does NOT unfollow when the tool was followed", () => {
    // Taking a tool out of your stack leaves you following it until you say
    // otherwise - this asymmetry with applyAddToOldStack is deliberate.
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: true };

    expect(applyRemoveFromStack(stacked).is_followed).toBe(true);
  });

  it("does NOT follow when the tool was already unfollowed", () => {
    const stacked = { ...baseTool(), is_in_stack: true, is_followed: false };

    expect(applyRemoveFromStack(stacked).is_followed).toBe(false);
  });

  it("preserves unrelated properties", () => {
    const stacked = { ...baseTool(), is_in_stack: true };

    const result = applyRemoveFromStack(stacked);

    expect(result.id).toBe("tool-1");
    expect(result.name).toBe("Clay");
  });

  it("does not mutate the input", () => {
    const input = { ...baseTool(), is_in_stack: true, is_followed: true };
    const before = { ...input };

    applyRemoveFromStack(input);

    expect(input).toEqual(before);
  });
});

describe("applyRemoveFromWatchlist", () => {
  it("clears only the watchlist flag", () => {
    const watchlisted = { ...baseTool(), is_in_watchlist: true, is_followed: true };

    const result = applyRemoveFromWatchlist(watchlisted);

    expect(result.is_in_watchlist).toBe(false);
  });

  it("does not touch the other lists", () => {
    const weirdState = {
      ...baseTool(),
      is_in_stack: true,
      is_in_watchlist: true,
      is_in_old_stack: true,
    };

    const result = applyRemoveFromWatchlist(weirdState);

    expect(result.is_in_stack).toBe(true);
    expect(result.is_in_old_stack).toBe(true);
  });

  it("does NOT unfollow when the tool was followed", () => {
    const watchlisted = { ...baseTool(), is_in_watchlist: true, is_followed: true };

    expect(applyRemoveFromWatchlist(watchlisted).is_followed).toBe(true);
  });

  it("does NOT follow when the tool was already unfollowed", () => {
    const watchlisted = { ...baseTool(), is_in_watchlist: true, is_followed: false };

    expect(applyRemoveFromWatchlist(watchlisted).is_followed).toBe(false);
  });

  it("preserves unrelated properties", () => {
    const watchlisted = { ...baseTool(), is_in_watchlist: true };

    const result = applyRemoveFromWatchlist(watchlisted);

    expect(result.id).toBe("tool-1");
    expect(result.name).toBe("Clay");
  });

  it("does not mutate the input", () => {
    const input = { ...baseTool(), is_in_watchlist: true, is_followed: true };
    const before = { ...input };

    applyRemoveFromWatchlist(input);

    expect(input).toEqual(before);
  });
});

describe("applyRemoveFromOldStack", () => {
  it("clears only the old stack flag", () => {
    // A tool in the old stack is unfollowed by applyAddToOldStack, but a user
    // can re-follow it manually without moving it - so it can arrive here
    // followed or not. Un-archiving must not force either state.
    const archived = { ...baseTool(), is_in_old_stack: true, is_followed: false };

    const result = applyRemoveFromOldStack(archived);

    expect(result.is_in_old_stack).toBe(false);
  });

  it("does not touch the other lists", () => {
    const weirdState = {
      ...baseTool(),
      is_in_stack: true,
      is_in_watchlist: true,
      is_in_old_stack: true,
    };

    const result = applyRemoveFromOldStack(weirdState);

    expect(result.is_in_stack).toBe(true);
    expect(result.is_in_watchlist).toBe(true);
  });

  it("does NOT re-follow an unfollowed archived tool", () => {
    // This is the case someone would most plausibly get wrong: pairing this
    // function with applyAddToOldStack's unfollow by making removal the
    // mirror-image "re-follow." It is not - un-archiving is silent on follow
    // state.
    const archived = { ...baseTool(), is_in_old_stack: true, is_followed: false };

    expect(applyRemoveFromOldStack(archived).is_followed).toBe(false);
  });

  it("does NOT unfollow an archived tool the user re-followed manually", () => {
    const archived = { ...baseTool(), is_in_old_stack: true, is_followed: true };

    expect(applyRemoveFromOldStack(archived).is_followed).toBe(true);
  });

  it("preserves unrelated properties", () => {
    const archived = { ...baseTool(), is_in_old_stack: true };

    const result = applyRemoveFromOldStack(archived);

    expect(result.id).toBe("tool-1");
    expect(result.name).toBe("Clay");
  });

  it("does not mutate the input", () => {
    const input = { ...baseTool(), is_in_old_stack: true, is_followed: false };
    const before = { ...input };

    applyRemoveFromOldStack(input);

    expect(input).toEqual(before);
  });
});

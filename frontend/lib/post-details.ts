import { MAX_GOAL_LENGTH, type PostTool, type PostType } from "@/lib/post";

export { MAX_GOAL_LENGTH };

// Mirror the rules in the new-post form and the backend's checkToolCount, so an
// author hears about a problem before saving rather than from a failed request.
export const MAX_POST_TOOLS = 10;
export const MIN_TITLE_LENGTH = 2;

/** A tool the author just suggested on the edit screen, not saved yet. */
export interface NewToolSuggestion {
  name: string;
  description: string;
  website: string;
  categories: number[];
}

/** A post with no tools comes back from the view as one all-null entry. */
export function realTools(tools: PostTool[] | null | undefined): PostTool[] {
  return (tools ?? []).filter((tool) => tool && tool.id);
}

export function minToolsFor(type: PostType): number {
  return type === "comparison" ? 2 : 1;
}

export function toolCountHint(type: PostType): string {
  const min = minToolsFor(type);
  return `At least ${min}, up to ${MAX_POST_TOOLS}`;
}

/**
 * Everything wrong with the details, so all of it can be fixed at once. The
 * goal's length is only checked when it changed: a goal longer than the form
 * allows can exist from an import, and it must not block an unrelated edit.
 */
export function validatePostDetails({
  type,
  title,
  goal,
  originalGoal,
  toolCount,
}: {
  type: PostType;
  title: string;
  goal: string;
  originalGoal: string;
  toolCount: number;
}): string[] {
  const label = type === "comparison" ? "comparison" : "playbook";
  const problems: string[] = [];

  if (title.trim().length < MIN_TITLE_LENGTH) {
    problems.push(`Title must be at least ${MIN_TITLE_LENGTH} characters.`);
  }
  if (goal !== originalGoal && goal.length > MAX_GOAL_LENGTH) {
    problems.push(`Goal must be at most ${MAX_GOAL_LENGTH} characters.`);
  }

  const min = minToolsFor(type);
  if (toolCount < min) {
    problems.push(`A ${label} needs at least ${min} ${min === 1 ? "tool" : "tools"}.`);
  }
  if (toolCount > MAX_POST_TOOLS) {
    problems.push(`A ${label} can have at most ${MAX_POST_TOOLS} tools.`);
  }

  return problems;
}

/** Whether saving has anything to send. Order does not matter. */
export function toolsChanged(
  saved: PostTool[],
  current: PostTool[],
  suggested: NewToolSuggestion[]
): boolean {
  if (suggested.length > 0 || saved.length !== current.length) return true;
  const ids = new Set(saved.map((tool) => tool.id));
  return current.some((tool) => !ids.has(tool.id));
}

/**
 * The body of PUT /post/{id}/tools. A pending suggestion is listed in tools with
 * its ticket's id, so it goes back as a ticket to keep, not as a tool.
 */
export function buildToolsUpdate(current: PostTool[], suggested: NewToolSuggestion[]) {
  return {
    tools: current.filter((tool) => !tool.is_ticket).map((tool) => tool.id),
    ticket_ids: current.filter((tool) => tool.is_ticket).map((tool) => tool.id),
    suggested_tools: suggested.map(({ name, description, website, categories }) => ({
      name,
      description,
      website,
      categories,
    })),
  };
}

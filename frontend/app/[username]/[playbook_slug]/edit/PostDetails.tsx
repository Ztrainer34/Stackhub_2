"use client";

import * as React from "react";
import { X } from "lucide-react";

import { ToolLogo } from "@/components/tool-logo";
import { ToolSearch, type AutocompletedTool, type SuggestedTool } from "@/app/new/tool-search";
import type { PostTool, PostType } from "@/lib/post";
import { MAX_GOAL_LENGTH, MAX_POST_TOOLS, minToolsFor, toolCountHint } from "@/lib/post-details";

/** The italic caption above each field, which sets them apart from the post. */
export function DetailLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const className = "block font-serif italic text-sm text-muted-foreground mb-1";
  return htmlFor ? (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <span className={className}>{children}</span>
  );
}

function ToolChip({
  name,
  logoUrl,
  pending,
  canRemove,
  onRemove,
}: {
  name: string;
  logoUrl: string;
  pending: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-md border py-1 pl-1.5 pr-1 text-sm ${
        pending ? "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950" : "bg-muted/40"
      }`}
    >
      <ToolLogo name={name} logoUrl={logoUrl} size="sm" className="shrink-0" />
      <span className="truncate">{name}</span>
      {pending && <span className="shrink-0 text-xs italic text-muted-foreground">pending review</span>}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove ${name}`}
        title={canRemove ? `Remove ${name}` : "A post needs at least this many tools. Add another one first."}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/**
 * The goal and tools on the edit screen. Unlike the post below them these are
 * not part of the draft, so they read as form fields: an italic caption, and
 * the goal in the same serif italic.
 */
export function PostDetails({
  type,
  goal,
  onGoalChange,
  onGoalDone,
  tools,
  suggested,
  onAddTool,
  onRemoveTool,
  onSuggestTool,
  onRemoveSuggested,
}: {
  type: PostType;
  goal: string;
  onGoalChange: (goal: string) => void;
  onGoalDone: () => void;
  tools: PostTool[];
  suggested: SuggestedTool[];
  onAddTool: (tool: AutocompletedTool) => void;
  onRemoveTool: (id: string) => void;
  onSuggestTool: (tool: SuggestedTool) => void;
  onRemoveSuggested: (id: string) => void;
}) {
  const goalRef = React.useRef<HTMLTextAreaElement>(null);

  // The goal is a sentence or two; grow to fit rather than scroll in a box.
  React.useLayoutEffect(() => {
    const el = goalRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [goal]);

  const total = tools.length + suggested.length;
  const canRemove = total > minToolsFor(type);
  const label = type === "comparison" ? "Comparison goal" : "Playbook goal";

  return (
    <div className="mx-auto w-full max-w-[648px] space-y-6 px-12 pt-6 max-[480px]:px-6">
      <div>
        <DetailLabel htmlFor="post-goal">{label}</DetailLabel>
        <textarea
          id="post-goal"
          ref={goalRef}
          value={goal}
          onChange={(e) => onGoalChange(e.target.value)}
          onKeyDown={(e) => {
            // One line of intent, like the title: Enter moves on.
            if (e.key === "Enter") {
              e.preventDefault();
              onGoalDone();
            }
          }}
          rows={1}
          placeholder="What will the reader get out of this?"
          className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 font-serif text-lg italic outline-none placeholder:text-muted-foreground/60"
        />
        {goal.length > MAX_GOAL_LENGTH - 50 && (
          <p
            className={`mt-1 text-xs ${
              goal.length > MAX_GOAL_LENGTH ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {goal.length} / {MAX_GOAL_LENGTH}
          </p>
        )}
      </div>

      <div>
        <DetailLabel>
          Featured tools <span className="not-italic">· {toolCountHint(type)}</span>
        </DetailLabel>
        <div className="flex flex-wrap items-center gap-2">
          {tools.map((tool) => (
            <ToolChip
              key={tool.id}
              name={tool.name}
              logoUrl={tool.logo_url}
              pending={tool.is_ticket}
              canRemove={canRemove}
              onRemove={() => onRemoveTool(tool.id)}
            />
          ))}
          {suggested.map((tool) => (
            <ToolChip
              key={tool.id}
              name={tool.name}
              logoUrl=""
              pending
              canRemove={canRemove}
              onRemove={() => onRemoveSuggested(tool.id)}
            />
          ))}
          <ToolSearch
            disabled={total >= MAX_POST_TOOLS}
            onSelect={onAddTool}
            onSuggestTool={onSuggestTool}
          />
        </div>
      </div>
    </div>
  );
}

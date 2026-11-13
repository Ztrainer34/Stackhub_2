import { MAX_GOAL_LENGTH } from "@/lib/post";
import { cn } from "@/lib/utils";

// Live "123/500" under a goal field. Callers pass the length their own check
// uses (the form validates the raw value, the rename dialog the trimmed one),
// so the number always agrees with the error on submit.
export function GoalCounter({ length }: { length: number }) {
  const over = length > MAX_GOAL_LENGTH;
  return (
    <p
      className={cn(
        "text-right text-xs",
        over ? "text-destructive font-medium" : "text-muted-foreground"
      )}
    >
      {length}/{MAX_GOAL_LENGTH}
    </p>
  );
}

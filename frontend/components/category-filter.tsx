"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryFilterProps {
  categories: CategoryOption[];
  /** Currently selected category ids. Empty array = no filter (show all). */
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

/**
 * A row of clickable category chips. Click a chip to select/deselect it.
 * Multiple categories can be selected at once (OR filtering). When nothing is
 * selected, the "All" state is active and everything is shown.
 */
export default function CategoryFilter({
  categories,
  selected,
  onChange,
  className,
}: CategoryFilterProps) {
  if (categories.length === 0) return null;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const allActive = selected.length === 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => onChange([])}
        className={cn(
          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          allActive
            ? "bg-primary text-primary-foreground border-transparent"
            : "bg-background text-muted-foreground hover:bg-muted"
        )}
      >
        All
      </button>

      {categories.map((c) => {
        const isSelected = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              isSelected
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-background text-foreground hover:bg-muted"
            )}
          >
            {isSelected && <Check className="w-3 h-3" />}
            {c.name}
          </button>
        );
      })}

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}

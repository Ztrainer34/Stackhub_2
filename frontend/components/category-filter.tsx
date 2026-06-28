"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
 * A dropdown category filter that allows selecting multiple categories at once.
 * Clicking an item toggles it without closing the menu (OR filtering). When
 * nothing is selected, the "All categories" state is active.
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

  const label =
    selected.length === 0
      ? "All categories"
      : selected.length === 1
      ? categories.find((c) => c.id === selected[0])?.name ?? "1 category"
      : `${selected.length} categories`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:w-44",
          className
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto w-56">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onChange([]);
          }}
          className={cn(selected.length === 0 && "font-semibold")}
        >
          All categories
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {categories.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={selected.includes(c.id)}
            onCheckedChange={() => toggle(c.id)}
            onSelect={(e) => e.preventDefault()}
          >
            {c.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

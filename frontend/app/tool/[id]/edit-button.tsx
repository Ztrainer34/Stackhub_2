"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The pencil a tool page's owner sees on each editable section. Rendering it is
 * always conditional on ownership, so it never appears for visitors.
 */
export function EditButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={className ?? "h-7 w-7 p-0 text-muted-foreground hover:text-foreground"}
    >
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  );
}

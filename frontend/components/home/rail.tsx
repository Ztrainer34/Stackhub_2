import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card grid that becomes a horizontal swipe row on phones (640px and below):
 * one card at 84% width with the next one peeking in. 2 columns above that, 4
 * from 1101px. Used by "GTM stacks" and "Top tools used by GTMs".
 * (Kept in a .tsx file so Tailwind's content scan always picks up the classes.)
 */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3.5 overflow-x-auto px-4 pb-2 min-[641px]:mx-0 min-[641px]:grid min-[641px]:grid-cols-2 min-[641px]:overflow-visible min-[641px]:px-0 min-[641px]:pb-0 min-[1101px]:grid-cols-4">
      {children}
    </ul>
  );
}

export function RailItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("w-[84%] min-w-0 shrink-0 snap-start min-[641px]:w-auto", className)}>{children}</li>;
}

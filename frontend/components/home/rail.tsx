import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card grid that becomes a horizontal swipe row on phones (below `sm`, 640px):
 * one card at 84% width with the next one peeking in. 2 columns from `sm`, 4 from `xl`.
 * Used by "GTM stacks" and "Top tools used by GTMs".
 * (Kept in a .tsx file so Tailwind's content scan always picks up the classes.)
 */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-px-4 px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4">
      {children}
    </ul>
  );
}

export function RailItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("w-[84%] shrink-0 snap-start sm:w-auto", className)}>{children}</li>;
}

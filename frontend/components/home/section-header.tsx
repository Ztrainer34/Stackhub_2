import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

type Props = {
  id: string;
  icon: LucideIcon;
  title: string;
  /** Right-hand button. Omit to show none. */
  action?: { href: string; label: string };
};

/** Icon + title on the left, dark button on the right. Same pattern as the dashboard. */
export function SectionHeader({ id, icon: Icon, title, action }: Props) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <h2 id={id} className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
        <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {action.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  id: string;
  icon: LucideIcon;
  title: string;
  /** Right-hand button. Omit to show none. */
  action?: { href: string; label: string };
};

/** Icon + title on the left, dark button on the right. */
export function SectionHeader({ id, icon: Icon, title, action }: Props) {
  return (
    <div className="mb-[18px] flex flex-wrap items-center justify-between gap-4">
      <h2 id={id} className="flex items-center gap-2.5 font-heading text-[28px] font-bold leading-[1.2] tracking-[-0.02em]">
        <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
        {title}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {action.label}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

/** One block of the homepage: the page's width and spacing around it. */
export function HomeSection({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="mx-auto max-w-[1280px] px-4 py-6 min-[641px]:py-8 min-[901px]:px-10"
    >
      {children}
    </section>
  );
}

/** The white card every block is made of. */
export const HOME_CARD = "rounded-2xl border bg-card";
export const HOME_CARD_LINK = `${HOME_CARD} transition-colors hover:border-[#C9C9C2]`;

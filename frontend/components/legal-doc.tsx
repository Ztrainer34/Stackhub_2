import Link from "next/link";
import { cn } from "@/lib/utils";

const links = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
];

export function LegalDoc({
  active,
  html,
}: {
  active: string;
  html: string;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm mb-6">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "transition-colors",
              active === l.href
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <article
        className="legal-prose rounded-xl border bg-card p-6 sm:p-10"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProfileTabsProps {
  username: string;
}

export default function ProfileTabs({ username }: ProfileTabsProps) {
  const searchParams = useSearchParams();

  // Overview is hidden until there is enough data to fill it, so Stack is
  // the default tab (must match the default in page.tsx). To bring it back,
  // restore its entry below and make "overview" the default again.
  const tab = searchParams.get("tab");
  const activeTab = !tab || tab === "overview" ? "stack" : tab;

  const tabs = [
    { key: "stack", label: "Stack", href: `/${username}` },
    { key: "playbooks", label: "Playbooks", href: `/${username}?tab=playbooks` },
    { key: "comparisons", label: "Comparisons", href: `/${username}?tab=comparisons` },
    { key: "starred", label: "Starred", href: `/${username}?tab=starred` },
  ];

  return (
    <div>
      <div className="flex gap-6 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "flex items-center px-1 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
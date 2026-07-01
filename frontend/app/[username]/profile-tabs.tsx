"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface ProfileTabsProps {
  username: string;
}

export default function ProfileTabs({ username }: ProfileTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine active tab based on pathname and search params
  const getActiveTab = () => {
    const tab = searchParams.get("tab");
    if (tab) return tab;

    // Default to overview for main profile page
    if (pathname === `/${username}`) return "overview";

    return "overview";
  };

  const activeTab = getActiveTab();

  const tabs = [
    { key: "overview", label: "Overview", href: `/${username}` },
    { key: "stack", label: "Stack", href: `/${username}?tab=stack` },
    { key: "playbooks", label: "Playbooks", href: `/${username}?tab=playbooks` },
    { key: "combos", label: "Combos", href: `/${username}?tab=combos` },
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
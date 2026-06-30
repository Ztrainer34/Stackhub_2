"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type ConnectionsTab = "followers" | "following" | "tools";

interface ConnectionsTabsProps {
  username: string;
  active: ConnectionsTab;
  children: React.ReactNode;
}

const tabs: { key: ConnectionsTab; label: string; segment: string }[] = [
  { key: "followers", label: "Followers", segment: "followers" },
  { key: "following", label: "Following", segment: "following" },
  { key: "tools", label: "Tools followed", segment: "tools-followed" },
];

export default function ConnectionsTabs({
  username,
  active,
  children,
}: ConnectionsTabsProps) {
  return (
    <div>
      <div className="flex gap-6 border-b mb-6 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/${username}/${tab.segment}`}
            className={cn(
              "pb-3 -mb-px text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              active === tab.key
                ? "text-foreground border-foreground"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}

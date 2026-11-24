import { Flame } from "lucide-react";

import { HOME_ROUTES } from "@/lib/home/config";
import type { HomePost } from "@/lib/home/types";
import { HomePostCard } from "./home-post-card";
import { HomeSection, SectionHeader } from "./section-header";

/**
 * "Trending playbooks": 6 cards, 3 / 2 / 1 columns. No "for you" label: a visitor
 * has no stack.
 */
export function TrendingSection({ posts }: { posts: HomePost[] }) {
  if (posts.length === 0) return null;
  return (
    <HomeSection labelledBy="home-trending">
      <SectionHeader
        id="home-trending"
        icon={Flame}
        title="Trending playbooks"
        action={{ href: HOME_ROUTES.playbooks, label: "Browse playbooks" }}
      />
      <ul className="grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 min-[1001px]:grid-cols-3">
        {posts.map((post) => (
          <li key={post.id} className="min-w-0">
            <HomePostCard post={post} />
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}

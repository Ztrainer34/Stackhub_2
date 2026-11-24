import type { Post } from "@/lib/post";

/** A chip under the search bar. */
export type ChipTool = { slug: string; name: string; logoUrl: string | null };

/** One card in the "GTM stacks" block: a row of GET /stacks/featured. */
export type HomeStack = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  /** Active stack, most held tools first. Only the first STACK_LOGOS_SHOWN are drawn. */
  tools: { id: string; name: string; logo_url: string | null }[];
  /** Visible tools in the active stack (can be more than tools.length: the API sends 6). */
  tool_count: number;
  /** Published playbooks + comparisons. */
  post_count: number;
};

/** What GET /posts/trending returns: the dashboard's PostCard takes it as is. */
export type HomePost = Post;

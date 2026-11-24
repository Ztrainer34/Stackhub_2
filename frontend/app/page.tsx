import { getServerAuthState } from "@/lib/auth-server";
import { getRecommendedTopPosts, getPopularTools } from "@/lib/homepage";
import HomepageContent from "@/components/homepage-content";
import { LandingPage } from "@/components/home/landing-page";
import { createClient } from "@/utils/supabase/server";

export default async function HomePage() {
  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    return <LandingPage />;
  }

  // Pre-fetch data for authenticated users. Six of each — the dashboard shows
  // two rows of three, and fetching more would only be discarded client-side.
  //
  // Each shelf degrades on its own. Awaiting these directly meant one failing
  // endpoint took down the entire dashboard with a server-side exception: a
  // preview deployment pointed at a backend without /homepage/popular-tools
  // showed a crash page rather than a dashboard with one empty section. Neither
  // shelf is load-bearing enough to be worth that.
  const supabase = await createClient();
  const [topPostsResult, popularToolsResult] = await Promise.allSettled([
    getRecommendedTopPosts(6, supabase),
    getPopularTools(6),
  ]);

  if (topPostsResult.status === "rejected") {
    console.error("Trending playbooks unavailable:", topPostsResult.reason);
  }
  if (popularToolsResult.status === "rejected") {
    console.error("Popular tools unavailable:", popularToolsResult.reason);
  }

  const topPosts =
    topPostsResult.status === "fulfilled" ? topPostsResult.value : [];
  const popularTools =
    popularToolsResult.status === "fulfilled" ? popularToolsResult.value : [];

  return (
    <HomepageContent
      initialTopPosts={topPosts}
      initialPopularTools={popularTools}
      user={authState.user}
    />
  );
}
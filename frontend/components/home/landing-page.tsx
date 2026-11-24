import { getHomeData } from "@/lib/home/queries";
import { HomeHero } from "./home-hero";
import { StacksSection } from "./stacks-section";
import { TopToolsSection } from "./top-tools-section";
import { TrendingSection } from "./trending-section";

/**
 * The logged-out homepage. Server component: everything is in the HTML a crawler
 * gets, and every card is a real <a href>. Renders inside the app layout, so the
 * site header and footer come from there.
 */
export async function LandingPage() {
  const { chips, stacks, posts, topTools } = await getHomeData();
  return (
    <div className="bg-background">
      <HomeHero chips={chips} />
      <StacksSection stacks={stacks} />
      <TrendingSection posts={posts} />
      <TopToolsSection groups={topTools} />
    </div>
  );
}

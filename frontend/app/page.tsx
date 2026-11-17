import { getServerAuthState } from "@/lib/auth-server";
import { getRecommendedTopPosts, getPopularTools } from "@/lib/homepage";
import Link from "next/link";
import HomepageContent from "@/components/homepage-content";
import { createClient } from "@/utils/supabase/server";
import type { Metadata } from "next";
import type { Post } from "@/lib/post";
import PostCard from "@/components/post-card";
import { to } from "@/lib/error-handling";
import { SITE_NAME, SITE_URL } from "@/lib/site";

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  GitCompare,
  Layers,
  TrendingUp,
  Search,
  PenTool,
  Share2,
} from "lucide-react"

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { url: "/" },
};

/**
 * Organization + WebSite structured data, so Google can tie the brand name to
 * this domain and show a sitelinks search box.
 */
function HomeJsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      // TODO: add `logo` (a square PNG of at least 112px, e.g. /logo.png) once
      // one exists in public/. The favicon is too small to qualify.
      // TODO: official profiles (LinkedIn company page, X, Product Hunt). Left
      // empty rather than guessed: a wrong sameAs is worse than none.
      sameAs: [] as string[],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];
  return (
    <script
      type="application/ld+json"
      // Static, trusted data; `<` is escaped so nothing can close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}


async function LandingPage({ topPosts }: { topPosts: Post[] }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <section className="relative flex-1 flex items-center justify-center py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              Discover the best GTM tools and playbooks
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Show and tell for GTMs
            </p>

            <p className="text-base text-muted-foreground max-w-2xl">
              StackHub is where GTM operators share their tool stacks and playbooks.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <Link href="/new" className="flex-1">
                <Button size="lg" className="w-full">
                  Add your toolstack
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/playbooks" className="flex-1">
                <Button size="lg" variant="outline" className="w-full">
                  Explore playbooks
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Content Section */}
      <section className="py-20 bg-muted/50">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center space-y-4 mb-16">
            <Badge variant="outline">
              Popular content
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Trending playbooks</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Discover the most popular GTM playbooks and tool comparisons from our community.
            </p>
          </div>

          {topPosts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topPosts.map((post) => (
                <Link key={post.id} href={`/${post.author_username}/${post.slug}`}>
                  <PostCard post={post} className="h-full" />
                </Link>
              ))}
            </div>
          ) : null}

          <div className="text-center mt-12">
            <Link href="/playbooks">
              <Button variant="outline" size="lg">
                View all articles
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section className="py-20 border-t">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center space-y-4 mb-16">
            <Badge variant="outline">
              Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Everything you need to share your insights</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful tools to create, share, and discover the best marketing comparisons and playbooks.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <GitCompare className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Side-by-side comparisons</CardTitle>
                <CardDescription>
                  Create detailed comparisons between tools with structured templates and visual elements.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Layers className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Stack explanations</CardTitle>
                <CardDescription>
                  Document and explain your entire tech stack with interactive diagrams and detailed breakdowns.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <PenTool className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Rich editor</CardTitle>
                <CardDescription>
                  Write with our powerful editor featuring formatting options and live previews.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Smart discovery</CardTitle>
                <CardDescription>
                  Find relevant comparisons and playbooks with powerful search and personalized recommendations.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Share2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Community driven</CardTitle>
                <CardDescription>
                  Vote, comment, and collaborate with other marketers to improve comparisons and insights.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Analytics & insights</CardTitle>
                <CardDescription>
                  Track your article performance and understand what the community finds most valuable.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="py-20 border-t">
        <div className="container px-4 md:px-6 mx-auto">
          <div className="text-center space-y-8 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold">Ready to share your marketing insights?</h2>
            <p className="text-xl text-muted-foreground">
              Join the community of marketers who are sharing their knowledge and helping others make better decisions.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <Link href="/new" className="flex-1">
                <Button size="lg" className="w-full">
                  Get started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/playbooks" className="flex-1">
                <Button size="lg" variant="outline" className="w-full">
                  Browse content
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default async function HomePage() {
  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    // Signed-out visitors include search engines: this is the page Google
    // indexes for "stackhub", so it shows real playbooks as real links.
    const [topPostsError, topPosts] = await to(
      getRecommendedTopPosts(6, await createClient())
    );
    if (topPostsError) {
      console.error("Trending playbooks unavailable:", topPostsError);
    }
    return (
      <>
        <HomeJsonLd />
        <LandingPage topPosts={topPosts ?? []} />
      </>
    );
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
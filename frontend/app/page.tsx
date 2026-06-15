import { getServerAuthState } from "@/lib/auth-server";
import { getRecommendedTopPosts, getTopCategories } from "@/lib/homepage";
import Link from "next/link";
import HomepageContent from "@/components/homepage-content";
import { createClient } from "@/utils/supabase/server";

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ArrowRight,
  BookOpen,
  GitCompare,
  Layers,
  Star,
  TrendingUp,
  Search,
  PenTool,
  Share2,
} from "lucide-react"

async function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <section className="relative flex-1 flex items-center justify-center py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              Discover the world&apos;s best tools and playbooks
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Explore how makers, marketers and product pros make the most of modern tools.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <Link href="/new" className="flex-1">
                <Button size="lg" className="w-full">
                  Start Writing
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/search?q=&t=post" className="flex-1">
                <Button size="lg" variant="outline" className="w-full">
                  Explore Articles
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
              Popular Content
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold">Trending Playbooks</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Discover the most popular marketing playbooks and tool comparisons from our community.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "HubSpot vs Salesforce",
                description: "Complete CRM comparison for marketing teams with feature breakdowns",
                author: "Sarah Chen",
                stars: 234,
                comments: 45,
                tags: ["CRM", "Marketing", "Sales"],
              },
              {
                title: "Email Marketing Stack",
                description: "Best practices for building an effective email marketing workflow",
                author: "Mike Rodriguez",
                stars: 189,
                comments: 32,
                tags: ["Email", "Automation", "Marketing"],
              },
              {
                title: "Analytics Tools Guide",
                description: "Comprehensive guide to choosing the right analytics platform",
                author: "Alex Kim",
                stars: 156,
                comments: 28,
                tags: ["Analytics", "Data", "Marketing"],
              },
            ].map((article, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <CardTitle className="hover:text-primary transition-colors">{article.title}</CardTitle>
                      <CardDescription className="line-clamp-2">{article.description}</CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-3">
                    {article.tags.map((tag, tagIndex) => (
                      <Badge key={tagIndex} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>by {article.author}</span>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <Star className="h-3 w-3" />
                        <span>{article.stars}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <BookOpen className="h-3 w-3" />
                        <span>{article.comments}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/search?q=&t=post">
              <Button variant="outline" size="lg">
                View All Articles
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
                <CardTitle>Side-by-Side Comparisons</CardTitle>
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
                <CardTitle>Stack Explanations</CardTitle>
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
                <CardTitle>Rich Editor</CardTitle>
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
                <CardTitle>Smart Discovery</CardTitle>
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
                <CardTitle>Community Driven</CardTitle>
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
                <CardTitle>Analytics & Insights</CardTitle>
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
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/search?q=&t=post" className="flex-1">
                <Button size="lg" variant="outline" className="w-full">
                  Browse Content
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
    return LandingPage();
  }

  // Pre-fetch data for authenticated users
  const supabase = await createClient();
  const [topPosts, topCategories] = await Promise.all([
    getRecommendedTopPosts(12, supabase),
    getTopCategories(8),
  ]);

  return (
    <HomepageContent
      initialTopPosts={topPosts}
      initialTopCategories={topCategories}
      user={authState.user}
    />
  );
}
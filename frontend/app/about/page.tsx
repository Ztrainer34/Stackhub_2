import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Users, Building2, UserSearch, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "About | StackHub",
  description:
    "StackHub is where GTM people show their tool stack and learn from everyone else's.",
};

// Not a LegalDoc: that component carries a nav across privacy, terms and
// cookies, and this page does not belong in that set.
const audiences = [
  {
    icon: Users,
    who: "Creators and agencies",
    what: "show your toolbox and playbooks, and get noticed",
  },
  {
    icon: Building2,
    who: "Teams",
    what: "find your next tool and learn how others get the most out of it",
  },
  {
    icon: UserSearch,
    who: "Hiring managers",
    what: "see what a candidate really works with, beyond the CV",
  },
  {
    icon: Wrench,
    who: "Tool companies",
    what: "get seen by the people who use your product",
  },
];

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
        Show and tell for GTM tools
      </h1>
      <p className="text-xl text-muted-foreground mb-12">
        StackHub is where GTM people show their tool stack and learn from
        everyone else&apos;s.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Why we built this</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          <p>
            We&apos;ve spent 10+ years working with tools every day. We set them
            up, picked up ideas from people who used them better, improved the
            playbooks we inherited and wrote new ones.
          </p>
          <p>
            The same problem kept coming back. There are tens of thousands of
            tools out there. Picking the right one can take hours of searching,
            asking around and sitting through demos. And once you&apos;ve picked
            it, the harder question remains: how do you get the most out of it?
          </p>
          <p>
            The answers live in people&apos;s heads or are scattered across the
            web. We always wanted one place to find them instead of digging for
            ages. So we built it.
          </p>
          <p className="text-foreground">
            On StackHub, GTM people share the tools they use, how they fit
            together, and the playbooks behind them.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Who it&apos;s for</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {audiences.map(({ icon: Icon, who, what }) => (
            <Card key={who} className="h-full">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                  <h3 className="font-semibold">{who}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {what}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Relative hrefs, not the absolute stackhub.me URLs from the copy — an
          absolute link would send someone on a preview deployment or a local
          build out to production mid-journey. */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/tools" className="sm:w-auto">
          <Button className="w-full sm:w-auto">
            Add your stack
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
        <Link href="/playbooks" className="sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            Browse playbooks
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowLeft } from "lucide-react";
import { getServerAuthState } from "@/lib/auth-server";
import InfiniteActivityFeed from "@/components/infinite-activity-feed";

export const metadata: Metadata = {
  title: "Your feed | StackHub",
  robots: { index: false, follow: false },
};

export default async function HomeFeedPage() {
  const authState = await getServerAuthState();
  if (authState.status !== "authenticated") {
    redirect(authState.status === "unauthenticated" ? "/login" : "/");
  }
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to home
      </Link>
      <div className="flex items-center gap-2 mb-6">
        <Activity className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Your feed</h1>
      </div>
      <InfiniteActivityFeed />
    </div>
  );
}

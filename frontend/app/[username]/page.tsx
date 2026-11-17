import { Suspense } from "react";
import ProfileContent from "./profile-content";
import ProfileLayoutWrapper from "./profile-layout-wrapper";
import { ClaimAccountDialog } from "@/components/claim-account-dialog";
import type { Metadata } from "next";
import { getUserFromUsername } from "@/lib/user";
import { metaDescription } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  try {
    const user = await getUserFromUsername(username);
    const name = user.display_name || user.username;
    const title = `${name}'s GTM tool stack and playbooks`;
    const description = metaDescription(
      user.bio?.trim() ||
        `See the GTM tools ${name} uses and the playbooks they have published on StackHub.`
    );
    const url = `/${user.username}`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, type: "profile", username: user.username },
      twitter: { card: "summary", title, description },
    };
  } catch {
    // Unknown user: the page renders its not-found state; keep it unindexed.
    return { title: "Profile not found", robots: { index: false } };
  }
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const { tab } = await searchParams;

  return (
    <ProfileLayoutWrapper username={username}>
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <ClaimAccountDialog username={username} />
      </Suspense>
      <ProfileContent username={username} activeTab={tab || "overview"} />
    </ProfileLayoutWrapper>
  );
}

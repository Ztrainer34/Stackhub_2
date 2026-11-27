import { Suspense } from "react";
import ProfileContent from "./profile-content";
import ProfileLayoutWrapper from "./profile-layout-wrapper";
import { ClaimAccountDialog } from "@/components/claim-account-dialog";

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { username } = await params;
  const { tab } = await searchParams;
  // Overview is hidden until there is enough data to fill it: Stack is the
  // default, and old ?tab=overview links land there too.
  const activeTab = !tab || tab === "overview" ? "stack" : tab;

  return (
    <ProfileLayoutWrapper username={username}>
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <ClaimAccountDialog username={username} />
      </Suspense>
      <ProfileContent username={username} activeTab={activeTab} />
    </ProfileLayoutWrapper>
  );
}

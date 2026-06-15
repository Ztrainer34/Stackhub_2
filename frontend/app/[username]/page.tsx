import ProfileContent from "./profile-content";
import ProfileLayoutWrapper from "./profile-layout-wrapper";

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
      <ProfileContent username={username} activeTab={tab || "overview"} />
    </ProfileLayoutWrapper>
  );
}

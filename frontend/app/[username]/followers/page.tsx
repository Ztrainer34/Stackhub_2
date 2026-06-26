import ProfileLayoutWrapper from "../profile-layout-wrapper";
import FollowList from "../follow-list";

export default async function FollowersPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return (
    <ProfileLayoutWrapper username={username}>
      <FollowList username={username} kind="followers" />
    </ProfileLayoutWrapper>
  );
}

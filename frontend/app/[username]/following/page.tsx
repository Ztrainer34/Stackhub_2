import ProfileLayoutWrapper from "../profile-layout-wrapper";
import ConnectionsTabs from "../connections-tabs";
import FollowList from "../follow-list";

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return (
    <ProfileLayoutWrapper username={username}>
      <ConnectionsTabs username={username} active="following">
        <FollowList username={username} kind="following" />
      </ConnectionsTabs>
    </ProfileLayoutWrapper>
  );
}

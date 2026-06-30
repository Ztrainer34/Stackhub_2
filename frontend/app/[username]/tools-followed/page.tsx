import ProfileLayoutWrapper from "../profile-layout-wrapper";
import ConnectionsTabs from "../connections-tabs";
import FollowedToolsContent from "../followed-tools-content";

export default async function ToolsFollowedPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return (
    <ProfileLayoutWrapper username={username}>
      <ConnectionsTabs username={username} active="tools">
        <FollowedToolsContent username={username} />
      </ConnectionsTabs>
    </ProfileLayoutWrapper>
  );
}

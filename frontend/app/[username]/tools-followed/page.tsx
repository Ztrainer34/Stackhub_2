import { Wrench } from "lucide-react";
import ProfileLayoutWrapper from "../profile-layout-wrapper";
import ConnectionsTabs from "../connections-tabs";

export default async function ToolsFollowedPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  return (
    <ProfileLayoutWrapper username={username}>
      <ConnectionsTabs username={username} active="tools">
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Wrench className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            No tools followed yet.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Following tools is coming soon.
          </p>
        </div>
      </ConnectionsTabs>
    </ProfileLayoutWrapper>
  );
}

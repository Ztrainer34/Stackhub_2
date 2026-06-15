import { createClient } from "@/utils/supabase/server";
import { notFound, redirect } from "next/navigation";
import NotificationsList from "@/components/notifications-list";

export default async function NotificationsPage() {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      redirect("/login");
    }

    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated with the latest activity on your posts and follows
          </p>
        </div>
        
        <NotificationsList />
      </div>
    );
  } catch {
    notFound();
  }
}
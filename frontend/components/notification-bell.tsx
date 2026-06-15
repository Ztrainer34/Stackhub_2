"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnreadNotificationCount } from "@/lib/hooks/useNotifications";

function NotificationBellClient() {
  const [isMounted, setIsMounted] = useState(false);
  const { data: unreadCount = 0, error } = useUnreadNotificationCount();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Debug log
  useEffect(() => {
    if (isMounted) {
      console.log("NotificationBell - unreadCount:", unreadCount, "error:", error);
    }
  }, [isMounted, unreadCount, error]);

  return (
    <Link href="/notifications">
      <Button variant="ghost" className="w-10 h-10 relative p-0 flex items-center justify-center">
        <Bell className="w-5 h-5" />
        {isMounted && unreadCount > 0 && (
          <span className="absolute top-1 right-1 bg-red-500 rounded-full w-2.5 h-2.5" />
        )}
      </Button>
    </Link>
  );
}

export default function NotificationBell() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Render the bell without the indicator during SSR
    return (
      <Link href="/notifications">
        <Button variant="ghost" className="w-10 h-10 relative p-0 flex items-center justify-center">
          <Bell className="w-5 h-5" />
        </Button>
      </Link>
    );
  }

  // Render the full component only on client
  return <NotificationBellClient />;
}
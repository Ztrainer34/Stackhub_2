"use client";

import { useEffect } from "react";
import { useNavbarTabs } from "@/components/navbar-tabs-context";
import ProfileTabs from "./profile-tabs";

interface ProfileTabsInjectorProps {
  username: string;
}

export default function ProfileTabsInjector({ username }: ProfileTabsInjectorProps) {
  const { setTabsContent } = useNavbarTabs();

  useEffect(() => {
    // Inject tabs into navbar when component mounts
    setTabsContent(<ProfileTabs username={username} />);

    // Cleanup: remove tabs when component unmounts
    return () => {
      setTabsContent(null);
    };
  }, [username, setTabsContent]);

  // This component doesn't render anything visible
  return null;
}
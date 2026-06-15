"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect } from "react";

export default function LogOut() {
  useEffect(() => {
    const signOut = async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      // Force a hard page refresh to clear all client-side state
      window.location.href = "/";
    };

    signOut();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p>Signing out...</p>
      </div>
    </div>
  );
}
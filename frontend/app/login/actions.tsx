"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function googleLogin() {
  const supabase = await createClient();

  const isDev = process.env.NODE_ENV === "development";

  const resp = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: isDev
        ? "http://localhost:3000/auth/callback"
        : "https://stackhub.me/auth/callback",
    },
  });

  if (resp.error) {
    redirect("/error");
  }

  redirect(resp.data.url);
}

export async function sendMagicLink(email: string) {
  const supabase = await createClient();

  const isDev = process.env.NODE_ENV === "development";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: isDev
        ? "http://localhost:3000/auth/callback"
        : "https://stackhub.me/auth/callback",
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

// There is no password login. The UI is magic-link and Google only, and the
// password `login` and `signup` actions that used to live here were never
// called — but every export of a "use server" file is a public endpoint, so
// they let anyone sign in or sign up with a password through this app. (The
// Supabase password grant itself is a dashboard setting; see the audit notes.)

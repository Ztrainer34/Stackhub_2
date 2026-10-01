"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/**
 * Where Supabase sends someone back to after they follow a login link.
 *
 * It has to be the origin they are actually on. Hardcoding the production URL
 * meant every Vercel preview bounced people to stackhub.me the moment they
 * logged in, so a preview could never be used signed in — which is the one
 * thing a preview is for.
 *
 * VERCEL_URL is set by Vercel per deployment and holds that deployment's own
 * hostname, preview or production alike. This is a server action, so it is read
 * at runtime and needs no NEXT_PUBLIC_ prefix. The final fallback covers a
 * production build running anywhere that is not Vercel.
 *
 * Supabase REJECTS a redirect that is not allow-listed, so the preview hostname
 * pattern must also exist under Authentication -> URL Configuration -> Redirect
 * URLs. Without that entry the exchange fails and the user lands on
 * /auth/auth-code-error.
 */
function authCallbackUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000/auth/callback";
  }

  // PREVIEW ONLY, and VERCEL_BRANCH_URL rather than VERCEL_URL.
  //
  // Vercel gives a deployment two hostnames. VERCEL_URL is the per-deployment
  // one and carries a build hash that changes on every push, so it can never be
  // allow-listed in Supabase by hand. VERCEL_BRANCH_URL is the branch alias —
  // stackhub-2-...-git-<branch>-<scope>.vercel.app — which is stable for the
  // life of the branch and is the link people actually share.
  //
  // Supabase silently substitutes the Site URL for a redirect it does not
  // allow, so getting this wrong looks like a redirect to production with the
  // code stranded in the query string, not like an error.
  //
  // Gated on VERCEL_ENV because VERCEL_URL and VERCEL_BRANCH_URL are both set on
  // production deployments too, where they hold a vercel.app hostname and never
  // the custom domain.
  if (process.env.VERCEL_ENV === "preview") {
    const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (previewHost) {
      return `https://${previewHost}/auth/callback`;
    }
  }

  return "https://stackhub.me/auth/callback";
}

export async function googleLogin() {
  const supabase = await createClient();

  const resp = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl(),
    },
  });

  if (resp.error) {
    redirect("/error");
  }

  redirect(resp.data.url);
}

export async function sendMagicLink(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: authCallbackUrl(),
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  // Validate email and password inputs
  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    redirect("/error");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/error");
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  // FIXME
  // type-casting here for convenience
  // in practice, you should validate your inputs
  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };
  const { error } = await supabase.auth.signUp(data);
  if (error) {
    redirect("/error");
  }
  revalidatePath("/", "layout");
  redirect("/");
}

"use server";

import { revalidatePath } from "next/cache";
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

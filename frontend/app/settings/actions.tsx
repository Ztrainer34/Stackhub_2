"use server"

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getServerAuthState } from "@/lib/auth-server";

export async function submitProfileSettings(formData: FormData) {
  const username = formData.get("username") as string;
  const email = formData.get("email") as string;
  const bio = formData.get("bio") as string;
  const location = formData.get("location") as string;
  const website = formData.get("website") as string;

  // Basic validation
  if (!username || username.length < 3) {
    throw new Error("Username must be at least 3 characters long");
  }

  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address");
  }

  try {
    const authState = await getServerAuthState();

    if (authState.status !== 'authenticated') {
      throw new Error("Not authenticated");
    }

    const supabase = await createClient();

    // Update user profile via your API
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify({
        username,
        bio,
        location,
        website
      })
    });

    if (!response.ok) {
      throw new Error("Failed to update profile");
    }

    // Update email in Supabase Auth if changed
    const { data: authUser } = await supabase.auth.getUser();
    if (authUser.user?.email !== email) {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) {
        throw new Error("Failed to update email");
      }
    }

    revalidatePath("/settings");
    return { success: true, message: "Profile updated successfully" };
  } catch (error) {
    console.error("Error updating profile:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to update profile");
  }
}
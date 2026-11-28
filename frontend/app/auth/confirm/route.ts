import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-url";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only a path on this site. Unchecked, a stackhub.me link signed the
  // visitor in and then sent them to any URL in `next` — an open redirect
  // straight out of the sign-in flow.
  const next = safeRedirectPath(searchParams.get("next"));
  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next);
    }
  }
  // redirect the user to an error page with some instructions
  redirect("/error");
}

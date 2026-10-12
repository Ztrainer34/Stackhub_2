import { NextResponse } from "next/server";
// The client you created from the Server-Side Auth instructions
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get("next") ?? "/";
  if (!next.startsWith("/")) {
    // if "next" is not a relative URL, use the default
    next = "/";
  }

  if (code) {
    const supabase = await createClient();
    const { data: session, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Following the link is what finalises an account claim. /api/claim
      // attaches the address and mails the link, but leaves the token live so a
      // mistyped address can be corrected; signing in is the proof that the
      // address reaches a real person, and only then is the token spent.
      await finaliseAccountClaim(session?.user?.id);

      const forwardedHost = request.headers.get("x-forwarded-host"); // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

/**
 * Marks any outstanding claim for this user as claimed. Best-effort: a failure
 * here must never block a sign-in, so it logs and returns. The worst case is a
 * claim token that stays usable until it expires, which is the same position
 * the flow is in a moment before this runs.
 */
async function finaliseAccountClaim(userId: string | undefined) {
  if (!userId) return;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) return;

  try {
    const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // supabase-js reports query failures in the returned object rather than
    // throwing, so the try/catch alone would swallow this silently and leave a
    // claim token live with nothing in the logs to say why.
    const { error } = await admin
      .from("account_claims")
      .update({ claimed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("claimed_at", null);

    if (error) {
      console.error("Could not finalise account claim:", error.message);
    }
  } catch (err) {
    console.error("Could not finalise account claim:", err);
  }
}

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";

/**
 * Claims a pre-seeded account: attaches the visitor's own email to it and
 * emails them a magic link to sign in.
 *
 * Authorised purely by the single-use token from the invite link, since the
 * visitor is not logged in. Requires SUPABASE_SERVICE_ROLE_KEY (server-only).
 */
export async function POST(request: Request) {
  const { token, email } = await request.json().catch(() => ({}));

  if (!token || !email) {
    return NextResponse.json(
      { error: "Missing token or email" },
      { status: 400 }
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    console.error("claim: missing SUPABASE_SERVICE_ROLE_KEY / URL");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: claim } = await admin
    .from("account_claims")
    .select("token, user_id, claimed_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json(
      { error: "This invite link isn't valid." },
      { status: 404 }
    );
  }
  if (claim.claimed_at) {
    return NextResponse.json(
      { error: "This account has already been claimed." },
      { status: 409 }
    );
  }
  if (claim.expires_at && new Date(claim.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This invite link has expired." },
      { status: 410 }
    );
  }

  // Attach the visitor's email to the account.
  const { error: updateError } = await admin.auth.admin.updateUserById(
    claim.user_id,
    { email, email_confirm: true }
  );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Burn the token so the link can't be reused.
  await admin
    .from("account_claims")
    .update({ claimed_at: new Date().toISOString(), claimed_email: email })
    .eq("token", token);

  // Email them a magic link so they can sign in to the account that's now theirs.
  const origin = new URL(request.url).origin;
  const supabase = await createServerClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (otpError) {
    // The account is already theirs; only the convenience email failed.
    return NextResponse.json({
      success: true,
      warning:
        "Account claimed, but we couldn't send the sign-in email. Use the normal login with your email address.",
    });
  }

  return NextResponse.json({ success: true });
}

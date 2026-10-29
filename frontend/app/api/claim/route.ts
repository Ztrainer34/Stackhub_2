import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { CLAIM_NONCE_COOKIE, claimRejection } from "@/lib/claim-guard";

/**
 * Claims a pre-seeded account: attaches the visitor's own email to it and
 * emails them a magic link to sign in.
 *
 * Authorised by the token from the invite link, since the visitor is not
 * logged in — and, after the first submission, by a cookie binding the claim
 * to that browser (see lib/claim-guard.ts). Requires SUPABASE_SERVICE_ROLE_KEY
 * (server-only).
 */
export async function POST(request: Request) {
  const { token, email } = await request.json().catch(() => ({}));

  if (typeof token !== "string" || typeof email !== "string" || !token || !email) {
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
    .select("token, user_id, claimed_at, expires_at, claimant_nonce")
    .eq("token", token)
    .maybeSingle();

  const { data: account } = claim
    ? await admin.auth.admin.getUserById(claim.user_id)
    : { data: null };

  const cookieStore = await cookies();
  const rejection = claimRejection({
    claim,
    now: new Date(),
    lastSignInAt: account?.user?.last_sign_in_at,
    cookieNonce: cookieStore.get(CLAIM_NONCE_COOKIE)?.value,
  });
  if (rejection) {
    return NextResponse.json({ error: rejection.error }, { status: rejection.status });
  }

  // First submission: bind the claim to this browser. The update only matches
  // while no nonce is set, so of two simultaneous first submissions exactly
  // one wins, and the other gets the same refusal as any later stranger.
  let nonce = claim!.claimant_nonce as string | null;
  if (!nonce) {
    nonce = randomBytes(32).toString("base64url");
    const { data: bound } = await admin
      .from("account_claims")
      .update({ claimant_nonce: nonce })
      .eq("token", token)
      .is("claimant_nonce", null)
      .select("token");
    if (!bound || bound.length === 0) {
      return NextResponse.json(
        {
          error:
            "This invite has already been started in another browser. Open it in the browser you used first, or ask for a new link.",
        },
        { status: 409 }
      );
    }
  }

  // From here on every response carries the nonce cookie — errors included.
  // Setting it only on success meant a first submission that failed (say, an
  // email already registered) bound the claim to this browser but never told
  // the browser, and every retry was then refused as "another browser".
  const withNonce = (response: NextResponse) => {
    response.cookies.set(CLAIM_NONCE_COOKIE, nonce!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/claim",
      maxAge: 60 * 60 * 24 * 30, // the claim links' own lifetime (claim-link.mjs)
    });
    return response;
  };

  // Attach the visitor's email to the account — and replace its password with
  // a random one nobody knows. Seeded accounts were created with passwords
  // that are committed to a public repo; without this, a claimed account kept
  // a password anyone could find, and Supabase's password sign-in is open to
  // the public anon key. The claimant signs in by magic link, never by password.
  const { error: updateError } = await admin.auth.admin.updateUserById(
    claim!.user_id,
    {
      email,
      email_confirm: true,
      // The fixed suffix covers every character class, so the password passes
      // whatever strength rule production's Auth settings enforce.
      password: randomBytes(32).toString("base64url") + "Aa1!",
    }
  );

  if (updateError) {
    // Supabase's own message says whether the address is already registered;
    // passing it through let a token holder probe which emails have accounts.
    console.error("claim: could not attach email:", updateError.message);
    return withNonce(
      NextResponse.json(
        { error: "That email address can't be used. Try a different one." },
        { status: 400 }
      )
    );
  }

  // Record the attempt, but do NOT set claimed_at — the claim is only final
  // once the sign-in link is actually followed, which /auth/callback marks.
  //
  // This is what makes a typo survivable. Previously the token was spent here,
  // so an address with a slip in it left the account pointing somewhere nobody
  // could reach and the link already dead. Now the token stays live: the person
  // can submit again with the correct address, or resend to the same one —
  // from the same browser, which the nonce cookie proves.
  await admin
    .from("account_claims")
    .update({ claimed_email: email })
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

  return withNonce(
    otpError
      ? // The account is already theirs; only the convenience email failed.
        NextResponse.json({
          success: true,
          warning:
            "Account claimed, but we couldn't send the sign-in email. Use the normal login with your email address.",
        })
      : NextResponse.json({ success: true })
  );
}

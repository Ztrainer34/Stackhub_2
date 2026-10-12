"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { validateClaimEmails } from "@/lib/claim-email";

/**
 * Shown on a pre-seeded profile opened with an invite link
 * (/<username>?claim=<token>). Lets the visitor attach their own email and take
 * ownership of the account.
 *
 * The claim is not final until the sign-in link is clicked, so the second
 * screen can offer a resend and the token survives a mistyped address.
 */
export function ClaimAccountDialog({ username }: { username: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("claim");

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);

  // Auto-open as soon as the invite link is opened.
  useEffect(() => {
    if (token) setOpen(true);
  }, [token]);

  if (!token) return null;

  const submitClaim = async (address: string) => {
    const resp = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: address }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Could not claim this account.");
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const problem = validateClaimEmails(email, confirmEmail);
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    setError("");

    try {
      await submitClaim(email.trim());
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // The token is only spent once the sign-in link is clicked, so asking for the
  // same email again is a safe retry rather than a second claim.
  const handleResend = async () => {
    setLoading(true);
    setError("");
    try {
      await submitClaim(email.trim());
      setResent(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resend. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Lets someone who mistyped go back and correct it, which only works because
  // the claim is not finalised until the link is followed.
  const handleUseDifferentEmail = () => {
    setDone(false);
    setResent(false);
    setError("");
    setConfirmEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="text-center py-2">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center">Check your inbox 📬</DialogTitle>
              <DialogDescription className="text-center pt-2">
                We sent a sign-in link to{" "}
                <strong className="break-all">{email.trim()}</strong>. Click it
                to start editing your page.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <Alert variant="destructive" className="mt-4 text-left">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <p className="text-sm text-muted-foreground mt-4">
              Didn&apos;t receive the email? Check your spam.
              <br />
              Not in spam?{" "}
              {resent ? (
                <span className="text-foreground">Sent again — give it a minute.</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  {loading ? "Resending…" : "Resend the email"}
                </button>
              )}
            </p>

            <p className="text-xs text-muted-foreground mt-3">
              Wrong address?{" "}
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Use a different email
              </button>
            </p>

            <Button className="w-full mt-6" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Claim your StackHub page</DialogTitle>
              <DialogDescription>
                Add your email to take possession of{" "}
                <strong>@{username}</strong>. You&apos;ll use this email to log
                in and edit your stack and playbooks.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2" noValidate>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="claim-email">Your email address</Label>
                <Input
                  id="claim-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              {/* Typing it twice catches a slip before a sign-in link is mailed
                  to an address that is not theirs. Paste is not blocked — doing
                  so annoys the careful and barely inconveniences anyone else. */}
              <div className="space-y-2">
                <Label htmlFor="claim-email-confirm">Confirm your email address</Label>
                <Input
                  id="claim-email-confirm"
                  type="email"
                  placeholder="you@company.com"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Claim this page
                  </>
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                We&apos;ll email you a sign-in link. No password needed.
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

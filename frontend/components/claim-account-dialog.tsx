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

/**
 * Shown on a pre-seeded profile opened with an invite link
 * (/<username>?claim=<token>). Lets the visitor attach their own email and take
 * ownership of the account.
 */
export function ClaimAccountDialog({ username }: { username: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("claim");

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Auto-open as soon as the invite link is opened.
  useEffect(() => {
    if (token) setOpen(true);
  }, [token]);

  if (!token) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError("");

    try {
      const resp = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || "Could not claim this account.");
      } else {
        setDone(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
              <DialogTitle className="text-center">
                This account is yours 🎉
              </DialogTitle>
              <DialogDescription className="text-center pt-2">
                We sent a sign-in link to <strong>{email}</strong>. Click it to
                log in — everything on this profile stays exactly as it is.
              </DialogDescription>
            </DialogHeader>
            <Button className="w-full mt-6" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Make this account yours</DialogTitle>
              <DialogDescription>
                You&apos;re viewing <strong>@{username}</strong>, a ready-made
                StackHub account. Add your email to take it over — the playbooks,
                tools and stack all stay with you.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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
                  required
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
                    Claim this account
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

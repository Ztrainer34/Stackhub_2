"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Loader2 } from "lucide-react";
import { sendMagicLink } from "@/app/login/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EmailAuthFormProps {
  onBack: () => void;
}

export default function EmailAuthForm({ onBack }: EmailAuthFormProps) {
  const [step, setStep] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError("");

    try {
      const result = await sendMagicLink(email);
      if (result.error) {
        setError(result.error);
      } else {
        setStep("sent");
      }
    } catch {
      setError("Failed to send magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendMagicLink = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await sendMagicLink(email);
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Failed to resend magic link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={step === "email" ? onBack : () => setStep("email")}
          className="h-8 w-8 p-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold">
          {step === "email" ? "Enter your email" : "Check your email"}
        </h2>
      </div>
      <div>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send magic link
                </>
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Mail className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-medium">Magic link sent!</h3>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to <strong>{email}</strong>. Click the link in your email to sign in.
              </p>
            </div>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={handleResendMagicLink}
                disabled={loading}
                className="text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Didn't receive the email? Resend"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
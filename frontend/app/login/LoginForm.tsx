"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiGoogle } from "@icons-pack/react-simple-icons";
import { Mail } from "lucide-react";
import { googleLogin } from "./actions";
import EmailAuthForm from "@/components/auth/email-auth-form";

/**
 * Google sign-in is switched off for now. The button and its action are kept
 * wired up so turning it back on is this one flag.
 */
const GOOGLE_LOGIN_ENABLED = false;

interface LoginFormProps {
  onHideTitle?: (hide: boolean) => void;
}

export default function LoginForm({ onHideTitle }: LoginFormProps) {
  // null = the chooser; otherwise the email form, framed for whichever the
  // person picked. Both send the same magic link.
  const [emailMode, setEmailMode] = useState<"login" | "signup" | null>(null);

  const openEmailAuth = (mode: "login" | "signup") => {
    setEmailMode(mode);
    onHideTitle?.(true);
  };

  const closeEmailAuth = () => {
    setEmailMode(null);
    onHideTitle?.(false);
  };

  if (emailMode) {
    return <EmailAuthForm mode={emailMode} onBack={closeEmailAuth} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4">
        {GOOGLE_LOGIN_ENABLED && (
          <Button variant="outline" className="w-full" onClick={googleLogin}>
            <SiGoogle />
            Continue with Google
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => openEmailAuth("login")}
        >
          <Mail />
          Continue with email
        </Button>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        New user?{" "}
        <button
          type="button"
          onClick={() => openEmailAuth("signup")}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Sign up
        </button>
      </div>

      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}

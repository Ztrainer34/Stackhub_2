"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiGoogle } from "@icons-pack/react-simple-icons";
import { Mail } from "lucide-react";
import { googleLogin } from "./actions";
import EmailAuthForm from "@/components/auth/email-auth-form";

interface LoginFormProps {
  onHideTitle?: (hide: boolean) => void;
}

export default function LoginForm({ onHideTitle }: LoginFormProps) {
  const [showEmailAuth, setShowEmailAuth] = useState(false);

  const handleShowEmailAuth = (show: boolean) => {
    setShowEmailAuth(show);
    onHideTitle?.(show);
  };

  if (showEmailAuth) {
    return <EmailAuthForm onBack={() => handleShowEmailAuth(false)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4">
        <Button variant="outline" className="w-full" onClick={googleLogin}>
          <SiGoogle />
          Continue with Google
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleShowEmailAuth(true)}
        >
          <Mail />
          Continue with email
        </Button>
      </div>
      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}

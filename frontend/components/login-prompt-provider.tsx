"use client";

import { createContext, useCallback, useContext, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoginForm from "@/app/login/LoginForm";

interface LoginPromptContextValue {
  /** Open the login modal, optionally with a contextual message. */
  promptLogin: (message?: string) => void;
}

const LoginPromptContext = createContext<LoginPromptContextValue>({
  promptLogin: () => {},
});

export function useLoginPrompt() {
  return useContext(LoginPromptContext);
}

export function LoginPromptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [hideTitle, setHideTitle] = useState(false);

  const promptLogin = useCallback((msg?: string) => {
    setMessage(msg);
    setHideTitle(false);
    setOpen(true);
  }, []);

  return (
    <LoginPromptContext.Provider value={{ promptLogin }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {!hideTitle && (
            <DialogHeader>
              <DialogTitle>Welcome to StackHub</DialogTitle>
              <DialogDescription>
                {message ?? "Sign in or create an account to continue."}
              </DialogDescription>
            </DialogHeader>
          )}
          <LoginForm onHideTitle={setHideTitle} />
        </DialogContent>
      </Dialog>
    </LoginPromptContext.Provider>
  );
}

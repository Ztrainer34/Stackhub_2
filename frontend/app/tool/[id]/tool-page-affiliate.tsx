"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLoginPrompt } from "@/components/login-prompt-provider";
import { Tool } from "@/lib/tool";
import { useAuth } from "@/lib/queries/use-auth";
import { useTool } from "@/lib/queries/use-tool-actions";
import { useAffiliateRequest } from "@/lib/queries/use-tool-page";

/**
 * "Ask for my affiliate link". The first click records the request (StackHub
 * collects them and contacts the vendor once a tool has enough). Once it is
 * saved, a pop-up explains what happens next. Logged-out visitors get the login
 * pop-up. Nothing emails the user, so the text must not promise it.
 *
 * TODO: the pop-up text is a placeholder until the final copy is decided.
 */
export function ToolPageAffiliate({ tool }: { tool: Tool }) {
  const { data } = useTool(tool.id);
  const current = data ?? tool;

  const auth = useAuth();
  const isAuthenticated = auth.data?.status === "authenticated";
  const { promptLogin } = useLoginPrompt();

  const request = useAffiliateRequest(tool.id);
  const [open, setOpen] = useState(false);

  const requested = current.is_affiliate_requested ?? false;

  const ask = () => {
    if (!isAuthenticated) {
      promptLogin("Sign in to ask for your affiliate link.");
      return;
    }
    request.mutate(true, { onSuccess: () => setOpen(true) });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommend {current.name}?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ask for your personal affiliate link and earn when people sign up
            through your stack or playbooks.
          </p>
          {requested ? (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Check className="h-4 w-4" />
                You asked for a link
              </p>
              <button
                type="button"
                onClick={() => request.mutate(false)}
                disabled={request.isPending}
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Cancel my request
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={ask}
              disabled={request.isPending}
              className="w-full justify-start"
            >
              <Link2 className="mr-2 h-4 w-4" />
              Ask for my affiliate link
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request noted</DialogTitle>
            <DialogDescription>
              {current.name} doesn&apos;t offer personal links through StackHub
              yet. You&apos;re on the list: once enough people ask, we&apos;ll
              contact the {current.name} team on your behalf.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

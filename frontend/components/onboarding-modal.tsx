"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolLogo } from "@/components/tool-logo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { useOnboarding } from "@/lib/queries/use-auth";
import { useUsernameValidation } from "@/lib/queries/use-username-validation";
import { useOnboardingOptions } from "@/lib/queries/use-onboarding-options";
import { saveOnboarding } from "@/lib/onboarding";
import { createClient } from "@/utils/supabase/client";

type Step = "username" | "focus" | "stack";

/** Pill-shaped multi-select tile used by both selection steps. */
function Tile({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-left text-sm transition-colors
        ${
          selected
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-muted/40 hover:bg-muted"
        }`}
    >
      {children}
    </button>
  );
}

export function OnboardingModal() {
  const { needsOnboarding, onboard, isOnboarding } = useOnboarding();
  const { username, setUsername, isValid, isChecking, message, status } =
    useUsernameValidation();

  const router = useRouter();
  const [step, setStep] = useState<Step>("username");
  // Creating the profile flips needsOnboarding to false, which would close the
  // dialog mid-flow. Once started, we keep it open until the user finishes.
  const [flowActive, setFlowActive] = useState(false);
  const [focus, setFocus] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch once the user leaves the username step. On the tools step the chosen
  // focus areas are sent too, so the grid reflects what they picked.
  const options = useOnboardingOptions(
    step !== "username",
    step === "stack" ? focus : []
  );

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const handleUsername = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    onboard(
      { username },
      {
        onSuccess: () => {
          setFlowActive(true);
          setStep("focus");
        },
        onError: (error) =>
          toast.error("Error", {
            description:
              error instanceof Error ? error.message : "Failed to complete onboarding",
          }),
      }
    );
  };

  /** Persists both steps, then leaves the flow. */
  const finish = async (destination: string) => {
    setSaving(true);
    try {
      await saveOnboarding(createClient(), { focus_areas: focus, tool_ids: tools });
      toast.success("Welcome to StackHub!", {
        description: tools.length
          ? `${tools.length} ${tools.length === 1 ? "tool" : "tools"} added to your stack.`
          : "Your profile is ready.",
      });
      setFlowActive(false);
      router.push(destination);
      router.refresh();
    } catch (error) {
      toast.error("Error", {
        description:
          error instanceof Error ? error.message : "Could not save your choices",
      });
    } finally {
      setSaving(false);
    }
  };

  // Signup takes over the whole screen rather than sitting in a small dialog.
  // The inner column keeps the content readable on wide monitors.
  const column = step === "username" ? "max-w-md" : "max-w-4xl";

  return (
    <Dialog open={needsOnboarding || flowActive} onOpenChange={() => {}}>
      <DialogContent
        className="[&>button]:hidden w-screen h-screen max-w-none rounded-none border-0
                   p-0 sm:rounded-none translate-x-0 translate-y-0 left-0 top-0
                   overflow-y-auto"
      >
        <div className={`mx-auto w-full ${column} px-6 py-12 sm:py-16`}>
        {/* ---------- 1. username ---------- */}
        {step === "username" && (
          <form onSubmit={handleUsername} className="space-y-5">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Welcome to StackHub</h2>
              <p className="text-muted-foreground mt-2">Choose a username</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-muted-foreground text-sm">
                Your username is how you&apos;ll appear to other people on StackHub.
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
              />
              {message && (
                <p
                  className={`text-sm ${
                    status === "available" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || isOnboarding || isChecking}
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        )}

        {/* ---------- 2. focus areas ---------- */}
        {step === "focus" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">What&apos;s your focus?</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Select the GTM categories you&apos;re most interested in to customise your
                experience.
              </p>
            </div>

            {options.isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(options.data?.focus_areas ?? []).map((area) => (
                  <Tile
                    key={area}
                    selected={focus.includes(area)}
                    onClick={() => toggle(focus, setFocus, area)}
                  >
                    {focus.includes(area) && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className="leading-tight">{area}</span>
                  </Tile>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep("stack")}>
                Skip
              </Button>
              <Button onClick={() => setStep("stack")}>Next</Button>
            </div>
          </div>
        )}

        {/* ---------- 3. tools ---------- */}
        {step === "stack" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                What&apos;s your GTM stack?
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Among these popular GTM tools, select those that are in your current stack.
                It&apos;ll help personalise your account.
              </p>
              <p className="text-muted-foreground/70 mt-1 text-xs">
                You can always add more tools to your stack later.
              </p>
            </div>

            {options.isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 16 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {(options.data?.tools ?? []).map((tool) => (
                  <Tile
                    key={tool.id}
                    selected={tools.includes(tool.id)}
                    onClick={() => toggle(tools, setTools, tool.id)}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-white">
                      <ToolLogo name={tool.name} logoUrl={tool.logo_url} size="sm" />
                    </span>
                    <span className="truncate">{tool.name}</span>
                  </Tile>
                ))}
              </div>
            )}

            <div className="flex flex-col justify-end gap-2 pt-2 sm:flex-row">
              {/* No dedicated "add tools" screen yet — send them to the browse page. */}
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => finish("/tools")}
              >
                Save and add more tools
              </Button>
              <Button disabled={saving} onClick={() => finish("/")}>
                {saving ? "Saving…" : "Done"}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

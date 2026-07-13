"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useOnboarding } from "@/lib/queries/use-auth";
import { useUsernameValidation } from "@/lib/queries/use-username-validation";

export function OnboardingModal() {
  const { needsOnboarding, onboard, isOnboarding } = useOnboarding();
  const { username, setUsername, isValid, isChecking, message, status } = useUsernameValidation();

  const router = useRouter();


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      return;
    }

    onboard(
      {
        username,
      },
      {
        onSuccess: () => {
          toast.success("Welcome to StackHub!", {
            description: "Your profile has been created successfully.",
          });
          router.push("/");
          router.refresh();
        },
        onError: (error) => {
          toast.error("Error", {
            description: error instanceof Error ? error.message : "Failed to complete onboarding",
          });
        },
      }
    );
  };

  const isSubmitDisabled = !isValid || isOnboarding || isChecking;

  return (
    <Dialog open={needsOnboarding} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[425px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Welcome to StackHub!</DialogTitle>
          <DialogDescription>
            Let&apos;s set up your profile. Choose a username that others will see when you share your content.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              placeholder="johndoe"
              value={username}
              // Usernames are case-insensitive and stored lowercase.
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={
                status === "invalid" ? "border-red-500" :
                status === "valid" ? "border-green-500" : ""
              }
            />
            {message && (
              <p className={`text-sm ${
                status === "invalid" ? "text-red-500" : 
                status === "valid" ? "text-green-500" : 
                "text-muted-foreground"
              }`}>
                {message}
              </p>
            )}
          </div>
          
          <Button
            type="submit" 
            disabled={isSubmitDisabled}
            className="w-full"
          >
            {isOnboarding ? "Creating Profile..." : "Complete Setup"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
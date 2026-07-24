"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getConsent, setConsent } from "@/lib/cookie-consent";

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-green-600" : "bg-muted-foreground/30",
        disabled && "opacity-60 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

const categories = [
  {
    key: "necessary" as const,
    title: "Strictly Necessary",
    description:
      "Required for the Service to work — login, security, and core functions, plus basic choices like language or display settings. These can't be turned off.",
    locked: true,
  },
  {
    key: "marketingAnalytics" as const,
    title: "Marketing & Analytics",
    description:
      "Help us understand which pages and playbooks are used and where we can improve, and let us and our partners (e.g. Google Analytics, LinkedIn, Meta) show relevant messages and measure campaigns.",
    locked: false,
  },
  {
    key: "preferences" as const,
    title: "Preferences",
    description:
      "Let us personalize your experience and remember your settings and choices.",
    locked: false,
  },
];

export function CookieSettings() {
  const [marketingAnalytics, setMarketingAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const c = getConsent();
    setMarketingAnalytics(c.marketingAnalytics);
    setPreferences(c.preferences);
    setLoaded(true);
  }, []);

  const save = (mktg: boolean, prefs: boolean) => {
    setConsent({ marketingAnalytics: mktg, preferences: prefs });
    setMarketingAnalytics(mktg);
    setPreferences(prefs);
    toast.success("Cookie preferences saved");
  };

  const values: Record<string, boolean> = {
    necessary: true,
    marketingAnalytics,
    preferences,
  };
  const setters: Record<string, (v: boolean) => void> = {
    marketingAnalytics: setMarketingAnalytics,
    preferences: setPreferences,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cookie className="w-5 h-5" />
            Cookie settings
          </CardTitle>
          <CardDescription>
            We use cookies, some of them essential, others optional. Choose which
            optional cookies you allow. See our{" "}
            <Link href="/cookies" className="underline hover:text-foreground">
              Cookie Policy
            </Link>{" "}
            for details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categories.map((cat, i) => (
            <div key={cat.key}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-medium flex items-center gap-2">
                    {cat.title}
                    {cat.locked && (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {cat.description}
                  </p>
                </div>
                <div className="pt-1">
                  <Toggle
                    label={cat.title}
                    checked={values[cat.key]}
                    disabled={cat.locked || !loaded}
                    onChange={(v) => setters[cat.key]?.(v)}
                  />
                </div>
              </div>
            </div>
          ))}

          <Separator />

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!loaded}
              onClick={() => save(true, true)}
            >
              Accept all cookies
            </Button>
            <Button
              variant="outline"
              disabled={!loaded}
              onClick={() => save(marketingAnalytics, preferences)}
            >
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

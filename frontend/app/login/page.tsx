"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const [hideTitle, setHideTitle] = useState(false);
  const router = useRouter();

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <Card className="w-full max-w-md relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => router.back()}
          aria-label="Go back"
        >
          <X className="h-4 w-4" />
        </Button>
        {!hideTitle && (
          <CardHeader>
            <CardTitle>Welcome to StackHub</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <LoginForm onHideTitle={setHideTitle} />
        </CardContent>
      </Card>
    </div>
  );
}

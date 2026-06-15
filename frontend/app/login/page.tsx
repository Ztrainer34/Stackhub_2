"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  const [hideTitle, setHideTitle] = useState(false);

  return (
    <div className="flex justify-center items-center min-h-screen p-4">
      <Card className="w-full max-w-md">
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

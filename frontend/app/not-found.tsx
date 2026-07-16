import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-7xl font-bold tracking-tight">404</h1>
        <p className="text-muted-foreground text-lg">
          The page you&apos;re looking for has moved or no longer exists.
        </p>
        <Link href="/">
          <Button size="lg">Go back to Home</Button>
        </Link>
      </div>
    </div>
  );
}

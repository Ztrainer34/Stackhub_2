import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NOT_FOUND_METADATA } from "@/lib/not-found-metadata";

export const metadata = NOT_FOUND_METADATA;

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <div className="flex items-center justify-center gap-4">
          <Image
            src="/praying-raccoon.svg"
            alt="A raccoon with its paws together, praying"
            width={112}
            height={112}
            className="h-24 w-24 sm:h-28 sm:w-28"
            priority
          />
          <h1 className="text-7xl font-bold tracking-tight">404</h1>
        </div>
        <p className="mt-6 text-muted-foreground text-lg">
          The page you&apos;re looking for has moved or no longer exists.
        </p>
        <Link href="/" className="mt-11 inline-block">
          <Button size="lg">Go back to Home</Button>
        </Link>
      </div>
    </div>
  );
}

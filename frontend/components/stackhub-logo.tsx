import Image from "next/image";

// The raccoon badge (public/logo.svg). Decorative: it always sits next to the
// "StackHub" wordmark inside the same link.
export function StackHubLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={28}
      height={28}
      className={className}
      priority
    />
  );
}

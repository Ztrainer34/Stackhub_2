import * as React from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface ToolLogoProps {
  name: string
  logoUrl?: string | null
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg"
}

export function ToolLogo({ name, logoUrl, size = "md", className }: ToolLogoProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(word => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage
        src={logoUrl || undefined}
        alt={`${name} logo`}
        className="object-contain"
      />
      <AvatarFallback className="bg-gray-100 text-gray-700 font-medium">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
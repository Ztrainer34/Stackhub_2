"use client";

import { Input } from "@/components/ui/input";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

interface SearchFormProps {
  className?: string;
  initialQuery?: string;
}

export function SearchForm({ className, initialQuery }: SearchFormProps) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery || searchParams?.get("q") || "");

  useEffect(() => {
    const currentQuery = initialQuery || searchParams?.get("q") || "";
    setQuery(currentQuery);
  }, [initialQuery, searchParams]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return (
    <form action="/search" method="GET" className={`w-full max-w-sm ${className || ""}`}>
      <input type="hidden" name="t" value="post" />
      <Input
        name="q"
        value={query}
        onChange={handleInputChange}
        placeholder="Search..."
        className="w-full"
      />
    </form>
  );
}
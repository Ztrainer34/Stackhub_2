"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Menu,
  Plus,
  UserIcon,
  Settings,
  LogOut,
  Layers,
  BookOpen,
  Blocks,
  GitCompare,
  Star,
  Wrench,
} from "lucide-react";
import { SearchForm } from "./search-form";
import { User } from "@/lib/user";

interface MobileNavbarProps {
  user: User | null;
}

export function MobileNavbar({ user }: MobileNavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] p-0">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <Link href="/" onClick={() => setIsOpen(false)}>
                <span className="font-bold text-lg">StackHub</span>
              </Link>
            </div>
            
            {/* Search */}
            <div className="p-4 border-b">
              <SearchForm />
            </div>
            
            {/* Navigation */}
            <div className="flex-1 p-4 space-y-4">
              <div className="space-y-2">
                <Link
                  href="/new"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Create post</span>
                </Link>
              </div>
              
              {user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {user.username.length > 0
                          ? user.username[0].toUpperCase()
                          : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{user.username}</span>
                  </div>
                  <Link
                    href={`/${user.username}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <UserIcon className="h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                  <Link
                    href={`/${user.username}?tab=stack`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Layers className="h-4 w-4" />
                    <span>Stack</span>
                  </Link>
                  <Link
                    href={`/${user.username}?tab=playbooks`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Playbooks</span>
                  </Link>
                  <Link
                    href={`/${user.username}?tab=combos`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Blocks className="h-4 w-4" />
                    <span>Combos</span>
                  </Link>
                  <Link
                    href={`/${user.username}?tab=comparisons`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <GitCompare className="h-4 w-4" />
                    <span>Comparisons</span>
                  </Link>
                  <Link
                    href={`/${user.username}?tab=starred`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Star className="h-4 w-4" />
                    <span>Starred</span>
                  </Link>
                  <Link
                    href={`/${user.username}/tools-followed`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Wrench className="h-4 w-4" />
                    <span>Tools followed</span>
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                  <Link
                    href="/auth/logout"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-red-600"
                    onClick={() => setIsOpen(false)}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    href="/login"
                    className="flex items-center justify-center p-3 rounded-lg border border-input hover:bg-accent transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    <span>Login</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
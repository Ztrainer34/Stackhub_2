"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut,
  Plus,
  Settings,
  User as UserIcon,
  Shield,
  Layers,
  BookOpen,
  GitCompare,
  Star,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchForm } from "./search-form";
import { MobileNavbar } from "./mobile-navbar";
import { useNavbarTabs } from "./navbar-tabs-context";
import NotificationBell from "./notification-bell";
import { PublicNav } from "./site/public-nav";

interface User {
  id: string;
  username: string;
  is_admin?: boolean;
}

interface NavBarContentProps {
  user: User | null;
}

export default function NavBarContent({ user }: NavBarContentProps) {
  const { tabsContent } = useNavbarTabs();

  return (
    // relative: the logged-out mobile menu drops down under the header.
    <header className="relative border-grid px-4 w-full border-b">
      <div className="container-wrapper">
        {!user && (
          <div className="mx-auto flex h-14 max-w-7xl items-center">
            <Link className="mr-4 flex items-center gap-2 lg:mr-6" href="/">
              <span className="font-bold">StackHub</span>
            </Link>
            <PublicNav />
          </div>
        )}
        {user && (
        <div className="container flex justify-between h-14 items-center">
          {/* Desktop Logo */}
          <div className="mr-4 hidden md:flex">
            <Link className="mr-4 flex items-center gap-2 lg:mr-6" href="/">
              <span className="hidden font-bold lg:inline-block">StackHub</span>
            </Link>
          </div>
          
          {/* Mobile Logo */}
          <div className="flex md:hidden">
            <Link className="flex items-center gap-2" href="/">
              <span className="font-bold">StackHub</span>
            </Link>
          </div>
          
          {/* Mobile Menu Button */}
          <MobileNavbar user={user} />
          
          {/* Desktop Menu */}
          <div className="hidden md:flex flex-1 items-center justify-end gap-3">
            <SearchForm />
            <Link href="/new">
              <Button variant="ghost" className="w-10">
                <Plus />
              </Button>
            </Link>
            <NotificationBell />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="cursor-pointer">
                    <UserAvatar user={user} />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href={`/${user.username}`}>
                    <DropdownMenuItem>
                      <UserIcon /> Profile
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <Link href={`/${user.username}?tab=stack`}>
                    <DropdownMenuItem>
                      <Layers /> Stack
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`/${user.username}?tab=playbooks`}>
                    <DropdownMenuItem>
                      <BookOpen /> Playbooks
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`/${user.username}?tab=comparisons`}>
                    <DropdownMenuItem>
                      <GitCompare /> Comparisons
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`/${user.username}?tab=starred`}>
                    <DropdownMenuItem>
                      <Star /> Starred
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`/${user.username}/tools-followed`}>
                    <DropdownMenuItem>
                      <Wrench /> Tools followed
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <Link href={"/settings"}>
                    <DropdownMenuItem>
                      <Settings /> Settings
                    </DropdownMenuItem>
                  </Link>
                  {/* Cosmetic: /admin itself 404s for non-admins, and the API refuses them. */}
                  {user.is_admin && (
                    <Link href={"/admin"}>
                      <DropdownMenuItem>
                        <Shield /> Admin
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <Link href={"/auth/logout"}>
                    <DropdownMenuItem>
                      <LogOut /> Sign out
                    </DropdownMenuItem>
                  </Link>
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>
        )}

        {/* Profile tabs section */}
        {tabsContent && (
          <div>
            <div className="container">
              {tabsContent}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
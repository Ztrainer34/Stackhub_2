"use client";

import { Share, Twitter, Facebook, Linkedin, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostActions } from "@/components/post-actions";
import { Post } from "@/lib/post";

interface VisitorActionsProps {
  post: Post;
  isAuthenticated?: boolean;
}

export default function VisitorActions({ post, isAuthenticated = false }: VisitorActionsProps) {
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const postTitle = post.name;
  
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const shareOptions = [
    {
      name: 'Copy link',
      icon: Copy,
      action: handleCopyLink,
    },
    {
      name: 'Share on Twitter',
      icon: Twitter,
      action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(postTitle)}&url=${encodeURIComponent(currentUrl)}`, '_blank'),
    },
    {
      name: 'Share on LinkedIn',
      icon: Linkedin,
      action: () => window.open(`https://linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`, '_blank'),
    },
    {
      name: 'Share on Facebook',
      icon: Facebook,
      action: () => window.open(`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, '_blank'),
    },
  ];

  return (
    <div className="flex gap-4 items-center">
      <div className="flex items-center">
        <PostActions 
          post={post} 
          variant="mini" 
          isAuthenticated={isAuthenticated}
        />
      </div>
      {/* <Button 
        size="sm" 
        variant="ghost"
        className="h-7 w-7 p-0"
        title="Fork"
      >
        <GitFork className="w-3 h-3" />
      </Button> */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size="sm" 
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Share"
          >
            <Share className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {shareOptions.map((option) => (
            <DropdownMenuItem 
              key={option.name}
              onClick={option.action}
              className="cursor-pointer"
            >
              <option.icon className="w-4 h-4 mr-2" />
              {option.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

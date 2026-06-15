"use client"

import { useCreatePostComment, usePostComments } from "@/lib/queries/use-post-comments";
import CommentInput from "./comment-input";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, MessageSquare, Flag, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { PostComment } from "@/lib/post";

function CommentCard({ comment } : { comment: PostComment }) {
  const [isLiked, ] = useState(false);
  const [likeCount, ] = useState(0);

  // const handleLike = () => {
  //   if (isLiked) {
  //     setLikeCount(prev => prev - 1);
  //   } else {
  //     setLikeCount(prev => prev + 1);
  //   }
  //   setIsLiked(!isLiked);
  //   // Here you would typically call an API to update the like status
  // };

  return (
    <Card className="mb-3 border-none shadow-none">
      <CardContent className="pt-4 pb-2 px-2">
        <div className="flex gap-3">
          {/* <Avatar className="h-10 w-10">
            <AvatarImage src={comment.author?.image} alt={comment.author?.name || "User"} />
            <AvatarFallback>
              {(comment.comm?.name || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar> */}
          
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {"Anonymous User"}
                </span>
                {comment.updated_at && (
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(comment.updated_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Flag className="mr-2 h-4 w-4" />
                    <span>Report</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <div className="mt-1 text-sm text-gray-700">
              {comment.content}
            </div>
            
            <div className="mt-3 flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-2 text-xs gap-1 ${isLiked ? 'text-blue-600' : 'text-gray-500'}`}
                // onClick={handleLike}
              >
                <ThumbsUp className="h-4 w-4" />
                <span>{likeCount > 0 ? likeCount : ''} Like</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs gap-1 text-gray-500"
              >
                <MessageSquare className="h-4 w-4" />
                <span>Reply</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex gap-3 mb-3 px-2 py-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export default function PostComments({
  postId,
  isAuthenticated,
}: {
  postId: string;
  isAuthenticated: boolean;
}) {
  const postComments = usePostComments(postId);
  const createPostComment = useCreatePostComment(postId);

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Comments</h3>
        {postComments.isSuccess && (
          <span className="text-sm text-gray-500">
            {postComments.data!.length} {postComments.data!.length === 1 ? 'comment' : 'comments'}
          </span>
        )}
      </div>
      
      <Separator />
      
      {isAuthenticated && (
        <div className="py-4">
          <CommentInput
            onSubmit={(content) => createPostComment.mutate(content)}
          />
        </div>
      )}
      
      {!isAuthenticated && (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-500 mb-2">Sign in to leave a comment</p>
          <Button variant="outline" size="sm">Sign In</Button>
        </div>
      )}
      
      <div className="space-y-1">
        {postComments.isLoading && (
          <>
            <CommentSkeleton />
            <CommentSkeleton />
          </>
        )}
        
        {postComments.isError && (
          <div className="text-center py-4">
            <p className="text-sm text-red-500">Failed to load comments</p>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => postComments.refetch()}
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        )}
        
        {postComments.isSuccess && postComments.data!.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No comments yet</p>
            <p className="text-xs text-gray-400">Be the first to share your thoughts</p>
          </div>
        )}
        
        {postComments.isSuccess &&
          postComments.data!.map((comment, i) => (
            <CommentCard key={i} comment={comment} />
          ))}
      </div>
    </div>
  );
}
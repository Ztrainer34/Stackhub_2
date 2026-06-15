"use server";

import VisitorActions from "./VisitorActions";
import Link from "next/link";
import { getPostWithRedirectInfo, getPostContent, getPostDraftContent } from "@/lib/post";
import { Separator } from "@/components/ui/separator";
import { getUserFromUsername } from "@/lib/user";
import { getServerAuthState } from "@/lib/auth-server";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PostComments from "@/components/post-comments";
import { createClient } from "@/utils/supabase/server";
import { notFound, permanentRedirect } from "next/navigation";
import ContentViewer from "./ContentViewer";
import { to } from "@/lib/error-handling";
import { RenamePostDialog } from "@/components/rename-post-dialog";
import PostActionsMenu from "@/components/post-actions-menu";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; playbook_slug: string }>;
}): Promise<Metadata> {
  const { username, playbook_slug } = await params;

  const supabase = await createClient();
  
  const [error, results] = await to(Promise.all([
    getUserFromUsername(username),
    getPostWithRedirectInfo(username, playbook_slug, supabase),
  ]));

  if (error) {
    return {
      title: "Post not found",
      description: "The requested post could not be found.",
    };
  }

  const [author, postResponse] = results;
  const post = postResponse.post;

  const title = `${post.name} by ${author.username} | StackHub`;
  const description = post.description || `A ${post.type.toLowerCase()} by ${author.username} on StackHub`;
  const url = `https://stackhub.me/${username}/${playbook_slug}`;
  // const imageUrl = await userAvatarUrl(author);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "StackHub",
      locale: "en_US",
      type: "article",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function PlaybookPage({
  params,
}: {
  params: Promise<{ username: string; playbook_slug: string }>;
}) {
  const { username, playbook_slug } = await params;

  const supabase = await createClient();

  const [error, results] = await to(Promise.all([
    getUserFromUsername(username),
    getPostWithRedirectInfo(username, playbook_slug, supabase),
  ]));

  if (error) {
    notFound();
  }

  const [author, postResponse] = results;
  
  // Handle redirect if needed
  if (postResponse.redirected && postResponse.canonical_slug) {
    permanentRedirect(`/${username}/${postResponse.canonical_slug}`);
  }
  
  const post = postResponse.post;

  const [postContentError, postContent] = await to(getPostContent(post.id));

  if (postContentError) {
    notFound();
  }

  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  const authorPageUrl = `/${author.username}`;

  const authState = await getServerAuthState();
  const isOwned = authState.status === 'authenticated' && (author.id === authState.user.id);

  // Fetch draft content if user owns the post
  let draftContent: string | null = null;
  if (isOwned) {
    const [draftError, draft] = await to(getPostDraftContent(post.id, supabase));
    if (!draftError) {
      draftContent = draft;
    }
  }

  return (
    <div>
      <div className="flex w-full justify-center">
        <div className="max-w-screen-md w-full p-6 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
              {post.name}
            </h1>
            {isOwned && (
              <RenamePostDialog post={post} />
            )}
          </div>

          <p>
            {post.description}
          </p>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link href={authorPageUrl}>
                <UserAvatar user={author} />
              </Link>

              <Link href={authorPageUrl}>
                {author.username}
              </Link>

            </div>
            <div className="flex items-center gap-2">
              {isOwned && (
                <>
                  <a href={`/${username}/${playbook_slug}/edit`}>
                    <Button variant="outline">Edit</Button>
                  </a>
                  <PostActionsMenu post={post} />
                </>
              )}
              <VisitorActions post={post} isAuthenticated={isAuthenticated} />
            </div>
          </div>

          <div className="flex">
            <Badge variant="outline" className="p-2">{post.type}</Badge>
          </div>

          <Separator />

          <ContentViewer
            publishedContent={postContent}
            draftContent={draftContent}
            isOwned={isOwned}
            isPublished={post.is_published}
            lastPublishedAt={post.last_publish}
            lastDraftUpdateAt={post.last_draft_update}
          />

          {/* FIXME */}
          <PostComments postId={post.id} isAuthenticated={isAuthenticated} />

          <div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

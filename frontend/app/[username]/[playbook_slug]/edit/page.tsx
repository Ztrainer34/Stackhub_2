"use server";

import { getPost, getPostDraftContent } from "@/lib/post";
import { notFound, redirect } from "next/navigation";
import { getServerAuthState } from "@/lib/auth-server";
import DynamicEditor from "./DynamicEditor";
import { createClient } from "@/utils/supabase/server";
import { to } from "@/lib/error-handling";

export default async function EditorPage({
  params,
}: {
  params: Promise<{ username: string, playbook_slug: string }>;
}) {
  const { username, playbook_slug } = await params;

  const supabase = await createClient();

  const [postError, post] = await to(getPost(username, playbook_slug, supabase));

  if (postError) {
    notFound();
  }

  const authState = await getServerAuthState();

  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
  }

  // Check if the authenticated user owns this post
  if (post.author_id !== authState.user.id) {
    notFound();
  }

  const [postContentError, postContent] = await to(getPostDraftContent(post.id, supabase))

  if (postContentError) {
    notFound();
  }

  const redirectUrl = `/${username}/${playbook_slug}`

  return (
    <DynamicEditor post={post} postContent={postContent} redirectUrl={redirectUrl} />
  );
}

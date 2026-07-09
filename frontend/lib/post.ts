import { fetchApi, fetchApiAuthenticated } from "./api";
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PostTool {
  id: string;
  name: string;
  logo_url: string;
  is_ticket: boolean;
}

export type PostType = "playbook" | "combo" | "comparison"

export interface Post {
  id: string;
  type: PostType;
  name: string;
  slug: string;
  author_id: string;
  author_username: string;
  description: string;
  tools: PostTool[];
  categories?: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
  last_publish: string;
  last_draft_update: string;
  is_starred: boolean;
  is_published: boolean;
}

export interface PaginatedPostsResponse {
  posts: Post[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
}

export interface PostComment {
  id: string;
  post_id: string;
  commenter_id: string;
  content: string;
  updated_at: string;
}

export interface PostResponse {
  post: Post;
  redirected: boolean;
  canonical_slug?: string;
}

export async function getPost(
  username: string,
  postSlug: string,
  supabaseClient?: SupabaseClient
): Promise<Post> {
  const resp = supabaseClient 
    ? await fetchApiAuthenticated(supabaseClient, `/user/${username}/posts/${postSlug}`)
    : await fetchApi(`/user/${username}/posts/${postSlug}`);

  if (!resp.ok) throw new Error("Could not get post");

  const response = (await resp.json()) as PostResponse;
  return response.post;
}

export async function getPostWithRedirectInfo(
  username: string,
  postSlug: string,
  supabaseClient?: SupabaseClient
): Promise<PostResponse> {
  const resp = supabaseClient 
    ? await fetchApiAuthenticated(supabaseClient, `/user/${username}/posts/${postSlug}`)
    : await fetchApi(`/user/${username}/posts/${postSlug}`);

  if (!resp.ok) throw new Error("Could not get post");

  return (await resp.json()) as PostResponse;
}

export async function getPostContent(postId: string): Promise<string | null> {
  const resp = await fetchApi(`/post/${postId}/content`);

  // Special no-content status
  if (resp.status === 204) return null;

  if (!resp.ok) throw new Error("Could not get post content");

  return await resp.text();
}

export async function getPostDraftContent(postId: string, supabaseClient: SupabaseClient): Promise<string> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/draft`);

  if (!resp.ok) throw new Error("Could not get draft content");

  return await resp.text();
}

export async function listUserPosts(username: string, page: number = 1, limit: number = 20, postType: PostType | "" = "", supabaseClient: SupabaseClient): Promise<PaginatedPostsResponse> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/user/${username}/posts?page=${page}&limit=${limit}&type=${postType}`);

  if (!resp.ok) throw new Error("Failed to get user posts");

  return (await resp.json()) as PaginatedPostsResponse;
}

export interface PostCounts {
  published: number;
  drafts: number;
  waiting: number;
  rejected: number;
}

export async function getUserPostCounts(username: string, postType: PostType | "" = "", supabaseClient: SupabaseClient): Promise<PostCounts> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/user/${username}/post-counts?type=${postType}`);

  if (!resp.ok) throw new Error("Failed to get post counts");

  return (await resp.json()) as PostCounts;
}

export async function listUserPostsByStatus(username: string, status: "waiting" | "rejected" | "all", postType: PostType | "" = "", page: number = 1, limit: number = 20, supabaseClient: SupabaseClient): Promise<PaginatedPostsResponse> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/user/${username}/approval-posts?status=${status}&type=${postType}&page=${page}&limit=${limit}`);

  if (!resp.ok) throw new Error("Failed to get posts");

  return (await resp.json()) as PaginatedPostsResponse;
}

export async function listUserStarredPosts(username: string, page: number = 1, limit: number = 20, supabaseClient: SupabaseClient): Promise<PaginatedPostsResponse> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/user/${username}/starred?page=${page}&limit=${limit}`);

  if (!resp.ok) throw new Error("Failed to list user stared posts");

  return (await resp.json()) as PaginatedPostsResponse;
}

export async function getUserKeyPlaybooks(
  username: string
): Promise<{ posts: Post[] }> {
  const resp = await fetchApi(
    `/user/${encodeURIComponent(username)}/key-playbooks`
  );

  if (!resp.ok) throw new Error("Failed to fetch key playbooks");

  return (await resp.json()) as { posts: Post[] };
}

export async function setKeyPlaybooks(
  supabaseClient: SupabaseClient,
  postIds: string[]
): Promise<void> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/user/key-playbooks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_ids: postIds }),
  });

  if (!resp.ok) throw new Error("Failed to update key playbooks");
}

export async function listPosts(): Promise<Post[] | null> {
  const resp = await fetchApi("/post");

  if (!resp.ok) return null;

  return (await resp.json()) as Post[];
}

export async function listPostComments(
  postId: string
): Promise<PostComment[] | null> {
  const resp = await fetchApi(`/post/${postId}/comment`);

  if (!resp.ok) throw new Error("Failed to retrieve comments");

  return (await resp.json()) as PostComment[];
}

export async function createPostComment(
  postId: string,
  content: string,
  supabaseClient: SupabaseClient,
): Promise<void> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/comment`);
  if (!resp.ok) throw new Error("Failed to create comment")
}

export async function removePostComment(commentId: string, supabaseClient: SupabaseClient): Promise<void> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/comment/${commentId}}`, {
    method: "DELETE",
  });
  if (!resp.ok) throw new Error("Failed to delete comment")
}

export async function updatePostComment(
  commentId: string,
  content: string,
  supabaseClient: SupabaseClient
): Promise<PostComment | null> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/comment/${commentId}}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: content,
    }),
  });

  if (!resp.ok) throw new Error("Could not update comment");

  return (await resp.json()) as PostComment;
}

// Not used atm
export async function uploadPostmedia(postId: string, file: File, supabaseClient: SupabaseClient) : Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const resp = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) throw new Error("Could not upload post media");

  return (await resp.json()).url;
}

export async function starPost(supabaseClient: SupabaseClient, postId: string): Promise<void> {
  const response = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/star`, {
    method: "PUT",
  });

  if (!response.ok) throw new Error("Failed to star post");
}

export async function unstarPost(supabaseClient: SupabaseClient, postId: string): Promise<void> {
  const response = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/star`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to unstar post");
}

export interface RenamePostData {
  name: string;
  description: string;
}

export interface RenamePostResponse {
  new_slug: string;
}

export async function renamePost(
  supabaseClient: SupabaseClient, 
  postId: string, 
  data: RenamePostData
): Promise<RenamePostResponse> {
  const response = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/rename`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to rename post");
  }

  return (await response.json()) as RenamePostResponse;
}

export async function publishPost(
  supabaseClient: SupabaseClient, 
  postId: string, 
) {
  const response = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/publish`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to publish post");
  }
}

export async function unpublishPost(
  supabaseClient: SupabaseClient, 
  postId: string, 
) {
  const response = await fetchApiAuthenticated(supabaseClient, `/post/${postId}/unpublish`)

  if (!response.ok) {
    throw new Error("Failed to unpublish post");
  }
}

export async function deletePost(
  supabaseClient: SupabaseClient, 
  postId: string, 
) {
  const response = await fetchApiAuthenticated(supabaseClient, `/post/${postId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    throw new Error("Failed to delete post");
  }
}

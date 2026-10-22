# CLAUDE.md - StackHub Project Guide

> This file provides context for AI assistants (like Claude) working on the StackHub project. It contains architectural decisions, coding patterns, and important context to maintain consistency.

## Project Overview

**StackHub** is a collaborative knowledge-sharing platform for marketing tools. Users can create and share:
- **Playbooks**: Guides for using one or more tools to achieve a goal
- **Comparisons**: Detailed comparisons between different tools

> A third type, **combos**, was removed in October 2026. It meant a playbook
> about several tools, which a playbook now simply is. Existing rows were
> reclassified by `20261005120000_drop_combo_post_type.sql`, and the
> `posts_type_check` constraint now permits only the two above.

## Tech Stack

### Backend (Go)
- **Framework**: Chi router v5
- **Database**: PostgreSQL with pgx/v5 driver
- **Query Builder**: SQLC for type-safe SQL queries
- **Authentication**: JWT tokens via Supabase Auth
- **File Storage**: AWS S3 (via Supabase storage)
- **Email**: Resend for transactional emails
- **Migrations**: Custom migration system

### Frontend (Next.js)
- **Framework**: Next.js 15.1.6 with App Router
- **React**: 19.1.0
- **State Management**: TanStack Query (React Query) for server state
- **Forms**: React Hook Form + Zod validation
- **Rich Text Editor**: Tiptap (`@tiptap/react` + `@tiptap/static-renderer`).
  Some unused Lexical packages and plugin files are still in the tree — ignore
  them, they are dead leftovers from an earlier editor.
- **Styling**: Tailwind CSS + shadcn/ui components
- **Authentication**: Supabase Auth client-side integration

## Project Structure

```
stackhub/
├── backend/
│   ├── cmd/server/                 # package main — wiring only
│   │   ├── main.go                 # startup: env, db pool, S3 bucket, mailer
│   │   ├── routes.go               # THE routing table + auth groups; builds
│   │   │                           #   one Handler per module and mounts it
│   │   ├── testdata/routes.golden  # pinned route table (see routes_test.go)
│   │   └── *_integration_test.go   # router-level + SQL tests (local DB only)
│   ├── internal/                   # one package per module (refactor step 2)
│   │   ├── post/                   # handler.go editing.go social.go
│   │   │                           #   service.go (rules) forms.go
│   │   ├── tool/                   # handler.go page.go service.go
│   │   ├── ticket/                 # handler.go service.go
│   │   ├── user/                   # handler.go gravatar.go
│   │   ├── search/                 # handler.go service.go
│   │   ├── stack/ feed/ notification/ category/ onboarding/
│   │   │   └── module.go           # each module: its Handler and deps
│   │   ├── httpx/                  # UserID, WriteError, CachePublic, body limits
│   │   ├── apperr/                 # service errors (no HTTP); apperrtest/
│   │   ├── pg/                     # TxBeginner, Text, UUID, OptionalText
│   │   ├── validate/               # TooLong, WebURL, UsernameProblem
│   │   ├── content/                # Tiptap → plain text
│   │   ├── storage/                # Bucket, ReceiveImage (upload checks)
│   │   └── testdb/                 # integration-test harness (tests only)
│   ├── pkg/
│   │   ├── db/                     # SQLC generated code
│   │   │   ├── query.sql.go        # Generated queries
│   │   │   ├── models.go           # Generated models
│   │   │   └── db.go               # Database connection
│   │   ├── auth/                   # Authentication utilities
│   │   ├── middleware/             # HTTP middlewares
│   │   └── mail/                   # Email service
│   └── migrations/                 # Database migrations
└── frontend/
    ├── app/                        # Next.js App Router pages
    │   ├── new/                    # Post creation
    │   │   ├── form.tsx           # Post creation form
    │   │   └── tool-search.tsx    # Tool search component
    │   └── [username]/[slug]/     # User post pages
    ├── components/                 # Reusable UI components
    ├── lib/
    │   ├── queries/               # React Query hooks
    │   │   ├── use-post-actions.ts  # Post mutations/queries
    │   │   ├── use-user-playbooks.ts # User posts queries
    │   │   ├── use-homepage.ts      # Homepage queries
    │   │   └── use-post-comments.ts # Comments queries
    │   └── post.ts                # Post API client functions
    └── utils/
        └── supabase/              # Supabase client setup
```

## Key Architectural Patterns

### Backend Patterns

#### 0. Modules
Each area of the API is a package under `backend/internal/` with a `Handler`
struct (in `module.go`) holding only the dependencies it uses. Rules:

- **`routes.go` stays the single routing table.** Modules do not register their
  own routes: the auth groups are the security boundary, and they are reviewed
  in one place. `routes.golden` pins every route's handler, middleware and
  measured anonymous access.
- **Modules depend one way.** Today: `post` → `ticket`, `post` → `notification`,
  `user` → `notification`. Never the reverse — Go makes an import cycle a
  compile error, so a cycle means the code is in the wrong module.
- **Shared code lives in the shared packages** (`httpx`, `apperr`, `pg`,
  `validate`, `content`, `storage`), never copied between modules.
- A new feature that is its own area (e.g. an AI chat) gets its own module.

#### 1. Handler Pattern
All HTTP handlers follow this pattern:
```go
func (h *Handler) HandlerName(w http.ResponseWriter, r *http.Request) {
    // 1. Extract user ID if authenticated
    userID := httpx.UserID(r)

    // 2. Parse request body/params
    var form SomeForm
    json.NewDecoder(r.Body).Decode(&form)

    // 3. Validate input
    if form.Field == "" {
        http.Error(w, "Missing field", http.StatusBadRequest)
        return
    }

    // 4. Execute database operations
    result, err := h.Queries.SomeQuery(r.Context(), params)
    if err != nil {
        log.Println(err)
        http.Error(w, "Error message", http.StatusInternalServerError)
        return
    }

    // 5. Return response
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}
```

#### 1b. Services — only where there is real logic
Most handlers stay parse → query → encode. The few with real rules — creating a
post, starring, resolving/rejecting tool tickets, editing a tool page, search —
keep them in the module's `service.go` instead:

- The handler reads the request (auth, URL params, JSON) and writes the
  response. The service validates, runs the transaction and decides side
  effects (e.g. `star` returns the email to send, or nil).
- A service returns `apperr.Invalid(...)`, `apperr.NotFound(...)`,
  `apperr.Conflict(...)`, `apperr.Internal(msg, cause)` etc.; the handler calls
  `httpx.WriteError(w, err)`. The message is sent verbatim, the cause only
  logged.
- Services take a `pg.TxBeginner` (the pool in production, a rollback `pgx.Tx`
  in tests) and never import `net/http`, chi or `httpx` —
  `TestServicesDoNotImportHTTP` (cmd/server/guards_test.go) enforces it.
- Validation is a pure function (`validateNewPost`, `validateToolPageUpdate`…)
  called first inside the service, so it is unit-testable and cannot be skipped.

Do not add a service for a handler that is a single query. `characterisation_
integration_test.go` pins the five endpoints' responses through the real router;
run it before and after touching any of them.

#### 2. Transaction Pattern
For operations requiring atomicity (e.g., notifications + actions):
```go
tx, err := h.DB.Begin(r.Context())
if err != nil {
    http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
    return
}
defer tx.Rollback(r.Context())

qtx := h.Queries.WithTx(tx)

// Perform operations with qtx...

err = tx.Commit(r.Context())
if err != nil {
    http.Error(w, "Failed to commit", http.StatusInternalServerError)
    return
}
```

#### 3. Authentication Middleware
- Protected routes use `jwtauth.Verifier()` + `Authenticator()`
- Optional auth routes use `OptionalAuthenticator()`
- Extract user ID with `httpx.UserID(r)` (required group) or
  `httpx.UserIDIfPresent(r)` (optional group; `uuid.Nil` when anonymous)

### Frontend Patterns

#### 1. React Query Mutations
All mutations follow this pattern:
```typescript
export function useSomeAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SomeData): Promise<SomeResponse> => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL!}/endpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(errorMessage || "Failed to perform action");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["some-key"] });
      toast.success("Action completed successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to perform action");
      console.error(error);
    },
  });
}
```

#### 2. React Query Cache Keys
Important query keys used throughout the app:

| Query Key | Usage | Invalidated By |
|-----------|-------|----------------|
| `["post", username, postSlug]` | Single post detail | `usePublishPost`, `useUnpublishPost` |
| `["posts", username, page, limit]` | User's posts with pagination | `useCreatePost`, `useDeletePost`, `usePublishPost` |
| `["starred-posts", page, limit]` | User's starred posts | `useStarPost`, `useUnstarPost`, `useDeletePost` |
| `["top-posts", limit]` | Homepage recommended posts | `useCreatePost` |
| `["user-posts"]` | General user posts | `useStarPost`, `useUnstarPost` |
| `["postComments", postId]` | Comments on a post | `useCreatePostComment` |

**Note**: There are some inconsistencies in query key usage. Some mutations invalidate broader keys (e.g., `["posts"]`) while others use specific parameters.

#### 3. Form Handling with React Hook Form + Zod
```typescript
const formSchema = z.object({
  field: z.string().min(2, { message: "Field must be at least 2 characters." }),
});

const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { field: "" },
});

function onSubmit(data: z.infer<typeof formSchema>) {
  someMutation.mutate(data, {
    onSuccess: () => router.push("/success"),
    onError: (error) => toast.error(error.message),
  });
}
```

## Database Schema

### Core Tables

#### `posts`
- Primary content table for playbooks and comparisons
- Contains both `content` (published) and `draft_content` (unpublished)
- Full-text search vectors for searchability
- Slugs with history tracking for SEO

#### `tools`
- Marketing tools catalog
- Many-to-many relationship with posts via `post_tools`
- Full-text search support

#### `tool_tickets`
- System for users to suggest new tools
- Linked to posts that requested the tool
- Can be resolved with existing tools or new tools

#### `profiles`
- User profiles (separate from auth)
- Usernames must be unique
- Onboarding flow creates profile after auth

#### `post_stars`
- Like/favorite system for posts
- Many-to-many between users and posts

#### `notifications`
- System notifications for user actions
- Built-in spam protection (deduplication)

### Important Relationships
- Posts → Tools: Many-to-many via `post_tools`
- Posts → Tool Tickets: One-to-many
- Users → Posts: One-to-many (author)
- Users → Posts: Many-to-many (stars)
- Users → Users: Many-to-many (follows)

## API Routes

### Public Routes
- `GET /user/{slug}` - Get user profile
- `GET /user/{slug}/posts` - List user's posts (with pagination)
- `GET /user/{slug}/posts/{post_slug}` - Get specific post (with redirect support)
- `GET /tool/autocomplete?q={query}` - Autocomplete tools
- `GET /search?t={type}&q={query}&p={page}` - Full-text search
- `GET /homepage/top-posts?limit={n}` - Get top posts
- `GET /homepage/top-categories?limit={n}` - Get top categories

### Protected Routes (Require JWT)
- `GET /me` - Get authenticated user profile
- `POST /post/create` - Create new post
- `POST /post/{id}/save` - Save post draft
- `POST /post/{id}/publish` - Publish post
- `GET /post/{id}/unpublish` - Unpublish post
- `PUT /post/{id}/rename` - Rename post (updates slug with history)
- `DELETE /post/{id}` - Delete post
- `PUT /post/{id}/star` - Star a post
- `DELETE /post/{id}/star` - Unstar a post
- `POST /post/{id}/comment` - Add comment to post
- `POST /post/{id}/upload_file` - Upload image for post
- `PUT /user/follow/{user_id}` - Follow user
- `DELETE /user/follow/{user_id}` - Unfollow user

### Admin Routes (authenticated, but **no role check**)

> ⚠️ These are gated only on being signed in. There is no admin role — the
> backend `/admin` group sits inside the ordinary authenticated group, and
> `frontend/app/admin/layout.tsx` still carries a `TODO: Add proper admin role
> check`. Any signed-in user can resolve or reject tool tickets.
>
> **`/admin` is a UI convention, not a security boundary.** Do not add
> privileged capabilities behind it until a real role check exists. This is why
> tool-page ownership is granted by `frontend/scripts/grant-tool-owner.mjs`
> using the service-role key rather than through an HTTP endpoint.

- `GET /admin/tool-tickets` - List tool tickets
- `POST /admin/tool-tickets/{id}/resolve-existing` - Resolve with existing tool
- `POST /admin/tool-tickets/{id}/resolve-new` - Resolve with new tool
- `POST /admin/tool-tickets/{id}/reject` - Reject tool ticket

## Important Business Logic

### Post Creation Flow
1. User submits post creation form with tools (existing + suggested)
2. Backend validates post type constraints:
   - Playbooks: 1 or more tools, up to `maxPostTools` (10)
   - Comparisons: 2 or more tools, up to `maxPostTools` (10)
3. Transaction creates post + links to existing tools + creates tool tickets for suggested tools
4. Returns post with slug for redirect to edit page
5. Frontend invalidates caches: `["posts"]`, `["top-posts"]`, `["user-posts"]`

### Slug Management
- Posts have a current `slug` and a `slug_history` table
- When renaming, old slug is stored in history
- API supports redirect from old slugs to current slug
- Response includes `redirected: true` flag for client-side handling

### Tool Ticket System
- Users can suggest new tools when creating posts
- Suggestions create "tool tickets" in pending state
- Admins can:
  - Resolve with existing tool (links tool to post)
  - Resolve with new tool (creates tool + links to post)
  - Reject ticket
- Posts display pending tools with special UI indicator

### Notification System
- Automatic notifications for:
  - Post stars
  - Post comments
  - New followers
- Built-in spam protection (deduplication via ON CONFLICT)
- Don't notify users for their own actions

## Common Gotchas & Solutions

### 1. Query Key Inconsistencies
**Problem**: Some mutations invalidate `["posts"]` while queries use `["posts", username, page, limit]`.

**Current Workaround**: Broader invalidations catch specific queries, but not optimal.

**Future Fix**: Standardize query keys across mutations and queries.

### 2. Tool Tickets in Forms
**Problem**: Form must track both confirmed tools and suggested tools separately.

**Solution**:
- `knownTools` Map stores confirmed tools
- `suggestedTools` array stores pending suggestions
- Both count toward post type limits
- Different UI rendering (orange card for pending)

### 3. Authentication Flow

#### Server-Side Authentication (Server Components)

**Pattern**: Use `getServerAuthState()` for all Server Components

```typescript
import { getServerAuthState } from "@/lib/auth-server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const authState = await getServerAuthState();

  // Handle unauthenticated users
  if (authState.status !== 'authenticated') {
    redirect(authState.status === 'unauthenticated' ? "/login" : "/");
  }

  // TypeScript knows authState.user exists here
  const user = authState.user;

  return <div>Hello {user.username}!</div>;
}
```

**Key Features**:
- ✅ **Cached with React `cache()`**: Multiple calls in same request = 1 backend call
- ✅ **Type-safe**: Discriminated union provides type narrowing
- ✅ **Handles onboarding**: Automatically detects `needs-onboarding` state
- ✅ **SSR-friendly**: Works in Server Components and Server Actions

**How it works**:
1. Calls `/me` endpoint with JWT from Supabase session
2. Backend returns 200 (authenticated), 401 (unauthenticated), or 428 (needs onboarding)
3. React `cache()` deduplicates calls during the same request render
4. Returns typed `AuthState` union

#### Client-Side Authentication (Client Components)

**Pattern**: Use `useAuth()` hook for Client Components

```typescript
"use client";
import { useAuth } from "@/lib/queries/use-auth";

export default function ClientComponent() {
  const auth = useAuth();

  if (auth.isLoading) return <Skeleton />;

  if (auth.data?.status === 'authenticated') {
    return <div>Hello {auth.data.user.username}!</div>;
  }

  return <LoginButton />;
}
```

**Key Features**:
- ✅ **Pre-hydrated**: Root layout fetches auth state server-side and populates React Query cache
- ✅ **No flash**: First render already has data
- ✅ **Cached**: Data shared across all Client Components
- ✅ **Auto-refresh**: Invalidates on mutations (login, logout, onboarding)

**Authentication State Types**:

```typescript
type AuthState =
  | { status: 'loading' }                                    // Initial load (client-side only)
  | { status: 'unauthenticated' }                           // Not logged in
  | { status: 'needs-onboarding'; session: Session }        // Logged in but no profile
  | { status: 'authenticated'; user: User; session: Session }; // Fully authenticated
```

**Migration from Legacy Pattern**:

❌ **Old pattern (deprecated)**:
```typescript
const [error, user] = await to(getAuthenticatedUser(supabase));
if (error) {
  redirect("/login");
}
```

✅ **New pattern**:
```typescript
const authState = await getServerAuthState();
if (authState.status !== 'authenticated') {
  redirect(authState.status === 'unauthenticated' ? "/login" : "/");
}
const user = authState.user; // Type-safe
```

**Benefits of new pattern**:
- Type-safety with discriminated unions
- Proper onboarding state handling
- Performance optimization via React cache
- Consistent with modern React patterns

### 4. Image Uploads
**Problem**: Rich text editor needs to upload images during editing.

**Current**: Uploads to S3 via backend endpoint, returns public URL.

**Important**: Images are uploaded to Supabase Storage (S3-compatible), not directly to AWS S3.

### 5. Draft vs Published Content
**Problem**: Posts have separate `content` and `draft_content` fields.

**Solution**:
- `content` = last published version (read-only for viewers)
- `draft_content` = current working version (editable by author)
- Save endpoint updates `draft_content`
- Publish endpoint copies `draft_content` → `content` and sets `is_published = true`

## Development Workflow

### Backend Development

> ⚠️ **Never hand-edit `backend/pkg/db/`.** It is generated by sqlc from
> `backend/db/query.sql` and the migrations. Edit the SQL, then regenerate.

1. Add or change the query in `backend/db/query.sql`. Prefer named parameters
   (`sqlc.arg(viewer_id)`) so the generated Go fields get readable names; a bare
   `$2` comes out as `Column2`. A query may not mix `$1` and `sqlc.arg()`.
2. Regenerate. **sqlc's PostgreSQL engine does not run natively on Windows**, so
   run it through WSL (Ubuntu is installed):

   ```bash
   # once — keep the binary out of /tmp, which WSL wipes between sessions
   mkdir -p ~/bin && curl -sSL https://github.com/sqlc-dev/sqlc/releases/download/v1.21.0/sqlc_1.21.0_linux_amd64.tar.gz | tar -xz -C ~/bin

   # every time
   wsl -d Ubuntu -- bash -c "cd /mnt/c/Users/Ziagu/Stackhub_2/backend && ~/bin/sqlc generate"
   ```

   sqlc checks every query against the migrations, so a misspelled column is a
   generate-time error rather than a 500 in production.
3. `go build ./...` — fix any handler that used a changed field.
4. Update the handler in the module that owns it (`backend/internal/<module>/`).
5. Run it with `.\run-local.ps1` (see LOCAL-DEV.md).

**Known sqlc v1.21 limitations in this codebase:**
- `auth.users` belongs to Supabase, so no migration creates it. It is declared
  for the analyser in `backend/db/sqlc-stubs/auth.sql`, which is never applied.
- It infers a `UNION`'s column types from the **first branch only**. If that
  branch reads a `NOT NULL` column but later branches return `NULL`, the field
  is generated non-nullable and the scan fails at runtime. `GetUserFeed` works
  around this — see the comment above its `SELECT`.
- `CASE` comes out as `interface{}`, `NULLIF` as `bool`, `COALESCE` as the
  non-null type. A UUID in an `interface{}` field serialises as a **byte array**,
  so check generated row types after any change to a complex query.

`SELECT *` is expanded into an explicit column list **at generate time**. After a
migration adds a column, regenerate, or queries keep returning the old columns.

### Frontend Development
1. Update React Query hooks in `lib/queries/`
2. Ensure cache invalidation is correct
3. Test with `npm run dev`
4. Before considering work done: `npx tsc --noEmit`, `npx next lint` and
   `npm run build`. ESLint failures (unused vars, `no-html-link-for-pages`) fail
   the Vercel build and are *not* caught by `tsc`.

### Database Migrations
1. Create a new SQL file in `backend/db/migrations/`
2. Use the naming convention `YYYYMMDDHHMMSS_description.sql`, with
   `-- +goose Up` / `-- +goose Down` sections
3. There is no migration runner in the repo — apply migrations by pasting the
   Up section (minus the goose comment lines) into the Supabase SQL editor

### Deployment order — always migration → backend → frontend

1. **Migration** in the Supabase SQL editor, then verify it applied
2. **Backend**: `git pull` on the VPS, `go build`, restart the service
3. **Frontend**: push to `main`; Vercel builds automatically. `NEXT_PUBLIC_*`
   variables are baked in at build time, so set them *before* the build

Shipping the backend before its migration 404s every affected page — this has
happened in production. The reverse order is safe: a new frontend against an old
backend just sees the new fields come back undefined.

## Testing Guidelines

### What to Test
- [ ] Cache invalidation after mutations
- [ ] Optimistic updates rollback on error
- [ ] Authentication flows (logged in/out states)
- [ ] Form validation (client + server side)
- [ ] Pagination behavior
- [ ] Search functionality
- [ ] Image upload flows

### Common Test Patterns
```typescript
// Test mutation with cache invalidation
test('creating post invalidates caches', async () => {
  const { result } = renderHook(() => useCreatePost());

  await act(async () => {
    await result.current.mutateAsync(postData);
  });

  expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["posts"]
  });
});
```

## Recent Changes

### 2026-10-12: sqlc generation restored
- **Fixed**: `pkg/db` had been hand-maintained for months on the belief that
  sqlc was unavailable. It is configured (`backend/sqlc.yaml`) and works through
  WSL; only the native Windows build lacks the PostgreSQL engine.
- **Found while regenerating**: four models had drifted from the schema
  (`Profile` was missing four columns added in June), `ToolTicket.post_id` was
  non-nullable although a July migration made it nullable, and three queries
  needed adjusting for sqlc's analyser.

### 2026-09-19: Doc correction pass
- **Fixed**: the Backend Development section claimed `sqlc generate` regenerates
  the Go code. It does not exist here — queries are hand-written into both
  `query.sql` and `query.sql.go`. This is the most important convention in the
  repo and it was documented backwards.
- **Fixed**: rich text editor is Tiptap, not Lexical
- **Added**: deployment order (migration → backend → frontend) and the reason
- **Added**: explicit warning that `/admin` has no role check
- **Added**: frontend pre-flight checks (`tsc`, `next lint`, `build`)

### 2026-09: Tool page ownership
- **Added**: `tool_owners` join table; owners edit a tool page's logo,
  description, vendor details and categories inline
- **Added**: `tools.description_rich` (Tiptap JSON) with `tools.description`
  kept as its plain-text projection, so search and embeddings are unaffected
- **Added**: "Claim this page" CTA linking to a Tally form; ownership is granted
  out of band via `frontend/scripts/grant-tool-owner.mjs`

### 2025-01-14: Authentication Pattern Modernization
- **Migrated**: All pages from `getAuthenticatedUser()` to `getServerAuthState()`
- **Added**: React `cache()` wrapper to deduplicate auth requests (1 request per page instead of 3+)
- **Fixed**: Homepage now correctly displays for authenticated users instead of landing page
- **Improved**: Type-safety with discriminated union for auth states
- **Benefits**: Better performance, proper onboarding flow, consistent patterns
- **Files Changed**:
  - `frontend/lib/auth-server.ts` (added React cache)
  - `frontend/app/page.tsx` (homepage)
  - `frontend/app/settings/page.tsx` (settings page)
  - `frontend/app/settings/actions.tsx` (server action)
  - `frontend/app/new/page.tsx` (post creation)
  - `frontend/app/community/page.tsx` (community page)
  - `frontend/app/admin/layout.tsx` (admin layout)
  - `frontend/app/[username]/[playbook_slug]/page.tsx` (post view)
  - `frontend/app/[username]/[playbook_slug]/edit/page.tsx` (post edit)
  - `frontend/app/[username]/profile-layout-wrapper.tsx` (profile layout)

### 2025-01-11: Post Creation Cache Invalidation
- **Added**: `useCreatePost` mutation hook in `use-post-actions.ts`
- **Refactored**: Post creation form to use React Query mutation instead of manual fetch
- **Benefits**: Automatic cache invalidation, better loading states, consistent error handling
- **Files Changed**:
  - `frontend/lib/queries/use-post-actions.ts` (added `useCreatePost`)
  - `frontend/app/new/form.tsx` (refactored to use mutation hook)

## Future Improvements

### Short Term
- [ ] Standardize React Query key patterns
- [ ] Add stale time configuration to more queries
- [ ] Improve error handling with structured error types
- [ ] Add loading skeletons for better UX

### Long Term
- [ ] Real-time collaboration with WebSockets
- [ ] Advanced analytics dashboard
- [ ] API rate limiting
- [ ] Redis caching layer
- [ ] Mobile app (React Native)
- [ ] Content moderation system

## Environment Variables

### Backend
```bash
DB_CONNECTION=postgresql://...
JWT_SECRET=...
S3_ENDPOINT=...
S3_REGION=...
S3_ACCESS_KEY=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=...
SUPABASE_PROJECT_REF=...
RESEND_API_KEY=...
```

### Frontend
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Useful Commands

```bash
# Backend
cd backend
go run ./cmd/server                     # Start server (the PACKAGE — naming
                                        # main.go alone misses every handler)
# Regenerate pkg/db after editing db/query.sql (sqlc needs WSL on Windows):
wsl -d Ubuntu -- bash -c "cd /mnt/c/Users/Ziagu/Stackhub_2/backend && ~/bin/sqlc generate"

# Frontend
cd frontend
npm run dev                             # Start dev server
npm run build                           # Production build
npm run lint                            # Lint code

# Database
psql $DB_CONNECTION                     # Connect to database
```

## Getting Help

### When Working on Posts
- Check `backend/internal/post/forms.go` for form structs
- Check `frontend/lib/queries/use-post-actions.ts` for mutations
- Review `backend/internal/post/` — `handler.go`, `editing.go`, `social.go`
  for the handlers, `service.go` for the rules; `cmd/server/routes.go` maps
  each URL to one

### When Working on Authentication
- Check `backend/pkg/middleware/middleware.go` for auth middleware
- Check `frontend/utils/supabase/` for client setup

### When Working on Database
- Check `backend/pkg/db/models.go` for table structures
- Check `backend/pkg/db/query.sql.go` for available queries

## Code Style Guidelines

### Go
- Use `log.Println(err)` before returning errors
- Always defer `tx.Rollback()` after beginning transactions
- Return appropriate HTTP status codes
- Use `pgtype` for nullable fields

### TypeScript/React
- Use `async/await` over `.then()` chains
- Destructure props in function signatures
- Use React Query for all server state
- Keep components focused (single responsibility)
- Use `toast` from sonner for user feedback

---

**Last Updated**: 2026-10-12
**Maintainer**: Project team
**Questions?** Check the README.md or ask in team chat

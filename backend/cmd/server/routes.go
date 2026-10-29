package main

import (
	"net/http"
	"regexp"

	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/jwtauth/v5"
	"stackhub.com/stackhub/internal/category"
	"stackhub.com/stackhub/internal/feed"
	"stackhub.com/stackhub/internal/httpx"
	"stackhub.com/stackhub/internal/notification"
	"stackhub.com/stackhub/internal/onboarding"
	"stackhub.com/stackhub/internal/post"
	"stackhub.com/stackhub/internal/search"
	"stackhub.com/stackhub/internal/stack"
	"stackhub.com/stackhub/internal/ticket"
	"stackhub.com/stackhub/internal/tool"
	"stackhub.com/stackhub/internal/user"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
)

// Origins the browser may call the API from. Compiled once: the CORS check
// runs on every request, and it used to compile both patterns each time.
var (
	vercelPreviewOrigin = regexp.MustCompile(`^https://stackhub-2-kzmw.*\.vercel\.app$`)
	localDevOrigin      = regexp.MustCompile(`^http://(localhost|127\.0\.0\.1):\d+$`)
)

// allowedOrigin reports whether a browser on origin may call the API: the
// production site, Vercel production and preview deployments, and local
// development on any port.
func allowedOrigin(origin string) bool {
	switch origin {
	case "https://stackhub.me", "https://www.stackhub.me", "https://stackhub-2-kzmw-one.vercel.app":
		return true
	}
	return vercelPreviewOrigin.MatchString(origin) || localDevOrigin.MatchString(origin)
}

// routes builds the HTTP router: global middleware first, then three groups
// split by how they treat authentication — required, optional, and none.
//
// It needs only the App and the JWT verifier, which is why it lives apart from
// main: everything else main does is wiring that runs once at startup.
func (app *App) routes(tokenAuth *jwtauth.JWTAuth) http.Handler {
	// One handler per module, each given only the dependencies it uses.
	categoryAPI := &category.Handler{Queries: app.queries}
	feedAPI := &feed.Handler{Queries: app.queries}
	searchAPI := &search.Handler{Queries: app.queries}
	notificationAPI := &notification.Handler{Queries: app.queries}
	stackAPI := &stack.Handler{DB: app.db, Queries: app.queries}
	ticketAPI := &ticket.Handler{DB: app.db, Queries: app.queries, Mailer: app.mailer}
	toolAPI := &tool.Handler{DB: app.db, Queries: app.queries, Bucket: app.bucket}
	userAPI := &user.Handler{DB: app.db, Queries: app.queries, Mailer: app.mailer, Bucket: app.bucket}
	onboardingAPI := &onboarding.Handler{DB: app.db, Queries: app.queries, Mailer: app.mailer}
	postAPI := &post.Handler{DB: app.db, Queries: app.queries, Mailer: app.mailer, Bucket: app.bucket}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.AllowContentType("application/json", "multipart/form-data"))
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			return allowedOrigin(origin)
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	// Image uploads. Authenticated exactly like the private routes below, but
	// the only routes allowed a body bigger than limitJSONBody's cap — and a
	// body limit can only be tightened, never raised, so they cannot share that
	// group's middleware. routes.golden pins both chains, so they cannot drift.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.Authenticator(tokenAuth))
		r.Use(shmiddleware.OnboardingEnforcer())
		r.Use(httpx.LimitUploadBody)

		r.Post("/user/avatar", userAPI.UploadAvatar)
		// Checks tool_owners itself, like updateToolPage.
		r.Post("/tool/{id}/logo", toolAPI.UploadToolLogo)
		// Both check the caller authored the post.
		r.Post("/post/{id}/upload_file", postAPI.UploadImage)
		r.Post("/post/{id}/upload_url", postAPI.UploadImage)
	})

	// Private routes
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.Authenticator(tokenAuth))
		r.Use(shmiddleware.OnboardingEnforcer())
		r.Use(httpx.LimitJSONBody)

		// Authenticated user routes
		r.Get("/me", userAPI.GetAuthenticatedUser)
		r.Get("/feed", feedAPI.GetFeed)
		r.Get("/onboarding/options", onboardingAPI.GetOnboardingOptions)
		r.Post("/onboarding/save", onboardingAPI.SaveOnboarding)
		r.Delete("/user/avatar", userAPI.RemoveAvatar)
		r.Put("/me", userAPI.UpdateProfile)

		r.Get("/top-recommended-users", userAPI.GetTopRecommendedUsers)

		// Profile/Onboarding routes
		r.Post("/profile/onboard", onboardingAPI.CompleteOnboarding)
		r.Get("/profile/username/available", userAPI.CheckUsernameAvailable)

		// Post routes
		// r.Get("/post", postAPI.ListPosts)
		r.Post("/post/create", postAPI.CreatePost)

		// Standalone tool suggestion from the /tools "Add tool" flow.
		r.Post("/tool/suggest", ticketAPI.SuggestTool)

		// Tool page editing. Checks tool_owners itself, so a signed-in user who
		// does not own the page gets a 403. (The logo upload is in the upload
		// group above.)
		r.Put("/tool/{id}/page", toolAPI.UpdateToolPage)
		r.Post("/post/{id}/save", postAPI.SavePost)
		r.Post("/post/{id}/publish", postAPI.PublishPost)
		// POST, not GET: a state-changing GET runs whenever anything fetches
		// the URL with the user's token — a server-side render with a crafted
		// path, a link preview, a prefetch.
		r.Post("/post/{id}/unpublish", postAPI.UnpublishPost)
		r.Put("/post/{id}/rename", postAPI.RenamePost)
		r.Put("/post/{id}/star", postAPI.StarPost)
		r.Delete("/post/{id}/star", postAPI.UnstarPost)
		r.Post("/post/{id}/comment", postAPI.CreatePostComment)
		r.Get("/post/{slug}/draft", postAPI.GetPostDraftContent)
		r.Delete("/post/{id}", postAPI.DeletePost)

		r.Put("/user/stack/{tool_id}", stackAPI.AddToStack)
		r.Delete("/user/stack/{tool_id}", stackAPI.RemoveFromStack)
		r.Put("/user/watchlist/{tool_id}", stackAPI.AddToWatchlist)
		r.Delete("/user/watchlist/{tool_id}", stackAPI.RemoveFromWatchlist)
		r.Put("/user/old-stack/{tool_id}", stackAPI.AddToOldStack)
		r.Delete("/user/old-stack/{tool_id}", stackAPI.RemoveFromOldStack)
		r.Put("/user/followed-tools/{tool_id}", toolAPI.FollowTool)
		r.Delete("/user/followed-tools/{tool_id}", toolAPI.UnfollowTool)

		r.Put("/user/key-tools", toolAPI.SetKeyTools)
		r.Put("/user/key-playbooks", postAPI.SetKeyPlaybooks)

		// Owner-only: posts pending tool approval or rejected.
		r.Get("/user/{slug}/approval-posts", postAPI.ListUserPostsByApprovalStatus)
		// Owner-only: post counts per status filter.
		r.Get("/user/{slug}/post-counts", postAPI.GetUserPostCounts)

		r.Put("/user/follow/{user_id}", userAPI.FollowUser)
		r.Delete("/user/follow/{user_id}", userAPI.UnfollowUser)

		// Notification routes
		r.Get("/notifications", notificationAPI.GetUserNotifications)
		r.Get("/notifications/unread-count", notificationAPI.GetUnreadNotificationCount)
		r.Put("/notifications/{id}/read", notificationAPI.MarkNotificationRead)
		r.Put("/notifications/read-all", notificationAPI.MarkAllNotificationsRead)

		// Admin routes for tool ticket management
		r.Route("/admin", func(r chi.Router) {
			// Tool ticket management
			r.Get("/tool-tickets", ticketAPI.ListToolTickets)
			r.Get("/tool-tickets/{id}", ticketAPI.GetToolTicket)
			r.Post("/tool-tickets/{id}/resolve-existing", ticketAPI.ResolveTicketWithExisting)
			r.Post("/tool-tickets/{id}/resolve-new", ticketAPI.ResolveTicketWithNew)
			r.Post("/tool-tickets/{id}/reject", ticketAPI.RejectTicket)
		})
	})

	// Routes that are different if authenticated
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.OptionalAuthenticator(tokenAuth))
		r.Use(httpx.LimitJSONBody)

		r.Get("/tool/{id}", toolAPI.GetTool)

		r.Get("/post/{slug}", postAPI.GetPost)
		r.Get("/user/{slug}/posts/{post_slug}", postAPI.GetUserPost)
		r.Get("/user/{slug}/starred", postAPI.ListUserStarredPosts)
		r.Get("/post/{slug}/content", postAPI.GetPostContent)
		r.Get("/post/{id}/comment", postAPI.ListPostComments)
		r.Get("/homepage/top-posts", feedAPI.GetTopPosts)
		r.Get("/homepage/popular-tools", toolAPI.GetPopularTools)

		r.Get("/user/{slug}/posts", postAPI.ListUserPosts)
		r.Get("/user/{slug}/followers", userAPI.ListFollowers)
		r.Get("/user/{slug}/following", userAPI.ListFollowing)

		// Optional auth: anonymous visitors get the plain profile, a signed-in
		// viewer additionally gets is_following for the Follow button.
		r.Get("/user/{slug}", userAPI.GetUser)

		r.Get("/search", searchAPI.Search)
	})

	// Public routes
	r.Group(func(r chi.Router) {
		r.Use(httpx.LimitJSONBody)

		// Tool routes
		r.Get("/tools", toolAPI.ListTools)
		r.Get("/tool/autocomplete", toolAPI.AutocompleteTool)
		r.Get("/tools/category/{categorySlug}", toolAPI.GetToolsByCategory)
		r.Get("/category/{categorySlug}", categoryAPI.GetCategoryBySlug)
		r.Get("/category/autocomplete", categoryAPI.AutocompleteCategory)

		// User routes
		r.Get("/user/{slug}/stack", stackAPI.ListUserStack)
		r.Get("/user/{slug}/watchlist", stackAPI.ListUserWatchlist)
		r.Get("/user/{slug}/old-stack", stackAPI.ListUserOldStack)
		r.Get("/user/{slug}/key-tools", toolAPI.ListUserKeyTools)
		r.Get("/user/{slug}/key-playbooks", postAPI.ListUserKeyPlaybooks)
		r.Get("/user/{slug}/followed-tools", toolAPI.ListUserFollowedTools)
		r.Get("/user/{slug}/stats", userAPI.GetUserStats)
		// Gravatar, fetched server-side so the email hash never leaves us.
		r.Get("/user/{slug}/gravatar", userAPI.GetGravatar)

		// Public browse listing for /playbooks
		r.Get("/posts", postAPI.ListPublishedPosts)
		r.Get("/posts/tool-facets", toolAPI.GetPublishedPostToolFacets)

		// Homepage routes
		r.Get("/homepage/top-categories", categoryAPI.GetTopCategories)
		r.Get("/search/facets", searchAPI.Facets)
	})

	return r
}

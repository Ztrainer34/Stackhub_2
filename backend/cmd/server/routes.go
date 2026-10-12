package main

import (
	"net/http"
	"regexp"

	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/jwtauth/v5"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
)

// routes builds the HTTP router: global middleware first, then three groups
// split by how they treat authentication — required, optional, and none.
//
// It needs only the App and the JWT verifier, which is why it lives apart from
// main: everything else main does is wiring that runs once at startup.
func (app *App) routes(tokenAuth *jwtauth.JWTAuth) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.AllowContentType("application/json", "multipart/form-data"))
	r.Use(cors.Handler(cors.Options{
		AllowOriginFunc: func(r *http.Request, origin string) bool {
			// if origin == "https://stackhub.me" {
			// 	return true
			// }
			// // FIXME: Precompile to avoid bottleneck
			// matched, _ := regexp.MatchString(`^http://(localhost|127\.0\.0\.1):\d+$`, origin)
			// return matched

			if origin == "https://stackhub.me" {
				return true
			}

			if origin == "https://www.stackhub.me" {
				return true
			}

			// Allow Vercel production and preview deployments
			if origin == "https://stackhub-2-kzmw-one.vercel.app" {
				return true
			}
			matched, _ := regexp.MatchString(`^https://stackhub-2-kzmw.*\.vercel\.app$`, origin)
			if matched {
				return true
			}

			// Allow localhost or 127.0.0.1 with any port

			// FIXME: Precompile to avoid bottleneck
			matched, _ = regexp.MatchString(`^http://(localhost|127\.0\.0\.1):\d+$`, origin)

			return matched
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Requested-With"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	// Private routes
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.Authenticator(tokenAuth))
		r.Use(shmiddleware.OnboardingEnforcer())

		// Authenticated user routes
		r.Get("/me", app.getAuthenticatedUser)
		r.Get("/feed", app.getFeed)
		r.Get("/onboarding/options", app.getOnboardingOptions)
		r.Post("/onboarding/save", app.saveOnboarding)
		r.Post("/user/avatar", app.uploadAvatar)
		r.Delete("/user/avatar", app.removeAvatar)
		r.Put("/me", app.updateProfile)

		r.Get("/top-recommended-users", app.getTopRecommendedUsers)

		// Profile/Onboarding routes
		r.Post("/profile/onboard", app.completeOnboarding)
		r.Get("/profile/username/available", app.checkUsernameAvailable)

		// Post routes
		// r.Get("/post", app.listPosts)
		r.Post("/post/create", app.createPost)

		// Standalone tool suggestion from the /tools "Add tool" flow.
		r.Post("/tool/suggest", app.suggestTool)

		// Tool page editing. Both handlers check tool_owners themselves, so a
		// signed-in user who does not own the page gets a 403.
		r.Put("/tool/{id}/page", app.updateToolPage)
		r.Post("/tool/{id}/logo", app.uploadToolLogo)
		r.Post("/post/{id}/save", app.savePost)
		r.Post("/post/{id}/publish", app.publishPost)
		r.Get("/post/{id}/unpublish", app.unpublishPost)
		r.Put("/post/{id}/rename", app.renamePost)
		r.Put("/post/{id}/star", app.starPost)
		r.Delete("/post/{id}/star", app.unstarPost)
		r.Post("/post/{id}/comment", app.createPostComment)
		r.Post("/post/{id}/upload_file", app.uploadImage)
		r.Get("/post/{slug}/draft", app.getPostDraftContent)
		r.Delete("/post/{id}", app.deletePost)

		r.Post("/post/{id}/upload_url", app.uploadImage)

		r.Put("/user/stack/{tool_id}", app.addToStack)
		r.Delete("/user/stack/{tool_id}", app.removeFromStack)
		r.Put("/user/watchlist/{tool_id}", app.addToWatchlist)
		r.Delete("/user/watchlist/{tool_id}", app.removeFromWatchlist)
		r.Put("/user/old-stack/{tool_id}", app.addToOldStack)
		r.Delete("/user/old-stack/{tool_id}", app.removeFromOldStack)
		r.Put("/user/followed-tools/{tool_id}", app.followTool)
		r.Delete("/user/followed-tools/{tool_id}", app.unfollowTool)

		r.Put("/user/key-tools", app.setKeyTools)
		r.Put("/user/key-playbooks", app.setKeyPlaybooks)

		// Owner-only: posts pending tool approval or rejected.
		r.Get("/user/{slug}/approval-posts", app.listUserPostsByApprovalStatus)
		// Owner-only: post counts per status filter.
		r.Get("/user/{slug}/post-counts", app.getUserPostCounts)

		r.Put("/user/follow/{user_id}", app.followUser)
		r.Delete("/user/follow/{user_id}", app.unfollowUser)

		// Notification routes
		r.Get("/notifications", app.getUserNotifications)
		r.Get("/notifications/unread-count", app.getUnreadNotificationCount)
		r.Put("/notifications/{id}/read", app.markNotificationRead)
		r.Put("/notifications/read-all", app.markAllNotificationsRead)

		// Admin routes for tool ticket management
		r.Route("/admin", func(r chi.Router) {
			// Tool ticket management
			r.Get("/tool-tickets", app.listToolTickets)
			r.Get("/tool-tickets/{id}", app.getToolTicket)
			r.Post("/tool-tickets/{id}/resolve-existing", app.resolveTicketWithExisting)
			r.Post("/tool-tickets/{id}/resolve-new", app.resolveTicketWithNew)
			r.Post("/tool-tickets/{id}/reject", app.rejectTicket)
		})
	})

	// Routes that are different if authenticated
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(tokenAuth))
		r.Use(shmiddleware.OptionalAuthenticator(tokenAuth))

		r.Get("/tool/{id}", app.getTool)

		r.Get("/post/{slug}", app.getPost)
		r.Get("/user/{slug}/posts/{post_slug}", app.getUserPost)
		r.Get("/user/{slug}/starred", app.listUserStarredPosts)
		r.Get("/post/{slug}/content", app.getPostContent)
		r.Get("/post/{id}/comment", app.listPostComments)
		r.Get("/homepage/top-posts", app.getTopPosts)
		r.Get("/homepage/popular-tools", app.getPopularTools)

		r.Get("/user/{slug}/posts", app.listUserPosts)
		r.Get("/user/{slug}/followers", app.listFollowers)
		r.Get("/user/{slug}/following", app.listFollowing)

		// Optional auth: anonymous visitors get the plain profile, a signed-in
		// viewer additionally gets is_following for the Follow button.
		r.Get("/user/{slug}", app.getUser)

		r.Get("/search", app.search)
	})

	// Public routes
	r.Group(func(r chi.Router) {

		// Tool routes
		r.Get("/tools", app.listTools)
		r.Get("/tool/autocomplete", app.autocompleteTool)
		r.Get("/tools/category/{categorySlug}", app.getToolsByCategory)
		r.Get("/category/{categorySlug}", app.getCategoryBySlug)
		r.Get("/category/autocomplete", app.autocompleteCategory)

		// User routes
		r.Get("/user/{slug}/stack", app.listUserStack)
		r.Get("/user/{slug}/watchlist", app.listUserWatchlist)
		r.Get("/user/{slug}/old-stack", app.listUserOldStack)
		r.Get("/user/{slug}/key-tools", app.listUserKeyTools)
		r.Get("/user/{slug}/key-playbooks", app.listUserKeyPlaybooks)
		r.Get("/user/{slug}/followed-tools", app.listUserFollowedTools)
		r.Get("/user/{slug}/stats", app.getUserStats)

		// Public browse listing for /playbooks
		r.Get("/posts", app.listPublishedPosts)
		r.Get("/posts/tool-facets", app.getPublishedPostToolFacets)

		// Homepage routes
		r.Get("/homepage/top-categories", app.getTopCategories)
		r.Get("/search/facets", app.facets)
	})

	return r
}

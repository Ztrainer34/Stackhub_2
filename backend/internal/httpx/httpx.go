// Package httpx holds what every handler shares on the HTTP side: who is
// calling, request body ceilings, cache headers, and turning a service's
// apperr.Error into a response.
package httpx

import (
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/storage"
	shmiddleware "stackhub.com/stackhub/pkg/middleware"
)

// UserID is the signed-in caller. Only for routes behind the Authenticator
// middleware, which guarantees it is set; anywhere else it panics.
func UserID(r *http.Request) uuid.UUID {
	return r.Context().Value(shmiddleware.UserIDKey{}).(uuid.UUID)
}

// UserIDIfPresent is the caller on optionally authenticated routes, or
// uuid.Nil for an anonymous one.
func UserIDIfPresent(r *http.Request) uuid.UUID {
	if val := r.Context().Value(shmiddleware.UserIDKey{}); val != nil {
		if userID, ok := val.(uuid.UUID); ok {
			return userID
		}
	}
	return uuid.Nil
}

// WriteError answers with a service's error. Anything that is not an
// apperr.Error is a bug in the service; it is logged and becomes a bare 500,
// so an unexpected error's text never reaches the client.
func WriteError(w http.ResponseWriter, err error) {
	var ae *apperr.Error
	if !errors.As(err, &ae) {
		log.Println(err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	if ae.Cause != nil {
		log.Println(ae.Cause)
	}
	http.Error(w, ae.Message, statusOf(ae.Kind))
}

func statusOf(k apperr.Kind) int {
	switch k {
	case apperr.KindInvalid:
		return http.StatusBadRequest
	case apperr.KindUnauthorized:
		return http.StatusUnauthorized
	case apperr.KindForbidden:
		return http.StatusForbidden
	case apperr.KindNotFound:
		return http.StatusNotFound
	case apperr.KindConflict:
		return http.StatusConflict
	default:
		return http.StatusInternalServerError
	}
}

// CachePublic marks a response as safe for shared caches — a CDN in front of
// the API, and the visitor's own browser — to store and serve to anyone.
//
// ONLY for responses that are byte-identical for every viewer. Anything that
// varies with who is asking — a response carrying is_starred, is_in_stack, an
// ownership flag, or a handler that branches on the viewer at all — must never
// carry this header, because a shared cache will hand one person's state to the
// next. tool.GetTool is the near miss worth remembering: its query has no
// per-user columns, but the handler resolves tool ownership from the viewer, so
// it is deliberately absent from the list of callers.
//
//	max-age                browsers
//	s-maxage               shared caches, which prefer it over max-age
//	stale-while-revalidate serve the stale copy immediately, refresh behind it
//
// Call this immediately before writing a SUCCESSFUL response, never at the top
// of a handler: headers already set are still sent by http.Error, so an early
// call would let a CDN cache a 500.
func CachePublic(w http.ResponseWriter, browserSeconds, sharedSeconds int) {
	w.Header().Set("Cache-Control", fmt.Sprintf(
		"public, max-age=%d, s-maxage=%d, stale-while-revalidate=%d",
		browserSeconds, sharedSeconds, sharedSeconds*2))
}

// Request body ceilings. Every route gets exactly one of the two middlewares
// below, chosen by the route in routes.go — never by the request's
// Content-Type, which the client controls: keyed on the header, a JSON route
// could be handed a 10 MB body just by claiming to be multipart.
//
// MaxJSONBody has to fit a whole post: publish sends the full Tiptap document.
// Images are URLs inside it, not bytes, so 2 MB is far above any real post.
//
// MaxUploadBody is the largest upload any route accepts (post images, 10 MB)
// plus the multipart envelope. Each upload handler tightens it further through
// storage.ReceiveImage — avatars and logos to 5 MB. It can only tighten: a
// MaxBytesReader cannot raise a cap an outer one already set, which is why the
// upload routes must not sit behind LimitJSONBody at all.
const (
	MaxJSONBody   = 2 << 20
	MaxUploadBody = 10<<20 + storage.MultipartOverhead
)

// LimitJSONBody caps the body of every non-upload route. Without it a single
// request could stream an unbounded body into json.Decode and on into a TEXT
// or JSONB column.
func LimitJSONBody(next http.Handler) http.Handler {
	return limitBodyTo(MaxJSONBody, next)
}

// LimitUploadBody is LimitJSONBody for the four image upload routes.
func LimitUploadBody(next http.Handler) http.Handler {
	return limitBodyTo(MaxUploadBody, next)
}

func limitBodyTo(limit int64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

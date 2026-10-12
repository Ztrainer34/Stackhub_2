package main

import (
	"fmt"
	"net/http"
)

// cachePublic marks a response as safe for shared caches — a CDN in front of
// the API, and the visitor's own browser — to store and serve to anyone.
//
// ONLY for responses that are byte-identical for every viewer. Anything that
// varies with who is asking — a response carrying is_starred, is_in_stack, an
// ownership flag, or a handler that branches on the viewer at all — must never
// carry this header, because a shared cache will hand one person's state to the
// next. getTool is the near miss worth remembering: its query has no per-user
// columns, but the handler resolves tool ownership from the viewer, so it is
// deliberately absent from the list of callers.
//
//	max-age                browsers
//	s-maxage               shared caches, which prefer it over max-age
//	stale-while-revalidate serve the stale copy immediately, refresh behind it
//
// Call this immediately before writing a SUCCESSFUL response, never at the top
// of a handler: headers already set are still sent by http.Error, so an early
// call would let a CDN cache a 500.
func cachePublic(w http.ResponseWriter, browserSeconds, sharedSeconds int) {
	w.Header().Set("Cache-Control", fmt.Sprintf(
		"public, max-age=%d, s-maxage=%d, stale-while-revalidate=%d",
		browserSeconds, sharedSeconds, sharedSeconds*2))
}

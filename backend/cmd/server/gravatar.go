package main

import (
	"io"
	"log"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi"
)

// The browser used to load https://gravatar.com/avatar/<email_hash> directly,
// which meant every profile, search result and follower list handed out the
// email hash — an unsalted SHA-256 of the address, reversible for any email in
// a breach list. getGravatar fetches the image itself, so the hash never
// leaves the server and the browser only ever sees /user/{username}/gravatar.

// gravatarClient's timeout stops a slow Gravatar from piling up handlers.
var gravatarClient = &http.Client{Timeout: 5 * time.Second}

// gravatarSizes are the sizes the frontend requests (user-avatar.tsx). Any
// other value falls back to the default, so the size parameter cannot be used
// to make the server fetch an unbounded variety of URLs.
var gravatarSizes = map[int]bool{48: true, 80: true, 128: true, 256: true}

const (
	defaultGravatarSize = 80
	maxGravatarBytes    = 1 << 20
)

// hexHash guards the one value interpolated into the upstream URL. It comes
// from our own trigger, but it is checked anyway because it builds a request.
var hexHash = regexp.MustCompile(`^[0-9a-f]{32,64}$`)

// gravatarBase is a variable only so tests can point it at a local server.
var gravatarBase = "https://gravatar.com/avatar/"

// fetchGravatar gets the image for a hash. status is 200 with the body and its
// Content-Type, 404 when the user has no Gravatar, or 502 for anything else —
// including an upstream answer that is not one of the image types we serve.
func fetchGravatar(r *http.Request, hash string, size int) (body []byte, contentType string, status int) {
	upstream := gravatarBase + hash + "?s=" + strconv.Itoa(size) + "&d=404"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upstream, nil)
	if err != nil {
		log.Println(err)
		return nil, "", http.StatusBadGateway
	}

	resp, err := gravatarClient.Do(req)
	if err != nil {
		log.Println("gravatar:", err)
		return nil, "", http.StatusBadGateway
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, "", http.StatusNotFound
	}
	if resp.StatusCode != http.StatusOK {
		log.Println("gravatar: upstream status", resp.StatusCode)
		return nil, "", http.StatusBadGateway
	}

	// Re-served from our API origin, so only accept the image types uploads
	// accept — never pass through whatever Content-Type upstream sends.
	contentType, _, _ = mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if _, ok := imageTypes[contentType]; !ok {
		log.Println("gravatar: unexpected content type", contentType)
		return nil, "", http.StatusBadGateway
	}

	body, err = io.ReadAll(io.LimitReader(resp.Body, maxGravatarBytes+1))
	if err != nil || len(body) > maxGravatarBytes {
		return nil, "", http.StatusBadGateway
	}
	return body, contentType, http.StatusOK
}

func gravatarSize(raw string) int {
	n, err := strconv.Atoi(raw)
	if err != nil || !gravatarSizes[n] {
		return defaultGravatarSize
	}
	return n
}

// gravatarNotFound answers "no avatar" — the frontend then shows the initial.
// It is cached on purpose: most users have no Gravatar, and without this
// every page view would re-ask Gravatar about each of them.
func gravatarNotFound(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "public, max-age=3600")
	http.Error(w, "No avatar", http.StatusNotFound)
}

func (app *App) getGravatar(w http.ResponseWriter, r *http.Request) {
	username := strings.ToLower(chi.URLParam(r, "slug"))
	if usernameProblem(username) != "" {
		gravatarNotFound(w)
		return
	}

	hash, err := app.queries.GetEmailHashByUsername(r.Context(), username)
	if err != nil || !hash.Valid || !hexHash.MatchString(hash.String) {
		gravatarNotFound(w)
		return
	}

	body, contentType, status := fetchGravatar(r, hash.String, gravatarSize(r.URL.Query().Get("s")))
	switch status {
	case http.StatusOK:
	case http.StatusNotFound:
		gravatarNotFound(w)
		return
	default:
		http.Error(w, "Avatar unavailable", status)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	cachePublic(w, 3600, 86400)
	w.Write(body)
}

package main

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
)

// Minimal valid headers: enough for http.DetectContentType to recognise each.
var (
	pngBytes  = append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	gifBytes  = []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;")
	webpBytes = append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), make([]byte, 32)...)
)

// imageUpload builds a multipart request carrying data in the "image" field,
// with the filename and Content-Type the CLIENT claims — which receiveImage
// must ignore.
func imageUpload(t *testing.T, field, filename, claimedType string, data []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)

	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="`+field+`"; filename="`+filename+`"`)
	h.Set("Content-Type", claimedType)
	part, err := mw.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/upload", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

func TestReceiveImageAccepts(t *testing.T) {
	cases := []struct {
		name, filename, claimedType string
		data                        []byte
		wantType, wantExt           string
	}{
		{"png", "photo.png", "image/png", pngBytes, "image/png", ".png"},
		{"webp", "photo.webp", "image/webp", webpBytes, "image/webp", ".webp"},
		// Accepted before this helper existed; still accepted, so nobody's
		// upload breaks.
		{"bmp", "scan.bmp", "image/bmp", append([]byte("BM"), make([]byte, 64)...), "image/bmp", ".bmp"},
		// A real image whose client-side name and type are lies. The stored
		// object must take its type and extension from the bytes.
		{"png named .html", "page.html", "text/html", pngBytes, "image/png", ".png"},
		// The polyglot from the security report: valid GIF header, HTML after
		// it. It is accepted — it IS a GIF — but stored as image/gif under
		// .gif, so a browser renders it as an image and never as a page.
		{"gif/html polyglot", "evil.html", "text/html", append(append([]byte{}, gifBytes...), "<html><script>alert(1)</script></html>"...), "image/gif", ".gif"},
		// Shorter than the 512-byte sniff window.
		{"tiny gif", "dot.gif", "image/gif", gifBytes, "image/gif", ".gif"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			img, ok := receiveImage(rec, imageUpload(t, "image", c.filename, c.claimedType, c.data), 1<<20)
			if !ok {
				t.Fatalf("rejected (%d %s); want accepted", rec.Code, strings.TrimSpace(rec.Body.String()))
			}
			defer img.File.Close()

			if img.ContentType != c.wantType || img.Ext != c.wantExt {
				t.Errorf("stored as %s %s; want %s %s", img.ContentType, img.Ext, c.wantType, c.wantExt)
			}
			// The sniff must not eat the start of the file.
			got, _ := io.ReadAll(img.File)
			if !bytes.Equal(got, c.data) {
				t.Errorf("file reads back %d bytes, differing from the %d uploaded", len(got), len(c.data))
			}
		})
	}
}

// countingReader records how many bytes were pulled through it.
type countingReader struct {
	r io.Reader
	n int
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += n
	return n, err
}

// The size check alone would still answer 413 — but only after the whole body
// had been read and spilled to a temp file. The point of the MaxBytesReader is
// that an oversized upload is cut off mid-stream, so a 10 GB body costs the
// server ~10 MB of reading, not 10 GB of disk.
func TestReceiveImageStopsReadingAtTheLimit(t *testing.T) {
	const maxBytes = 1 << 10
	req := imageUpload(t, "image", "huge.png", "image/png", append(append([]byte{}, pngBytes...), make([]byte, 1<<20)...))
	counter := &countingReader{r: req.Body}
	req.Body = io.NopCloser(counter)
	total := req.ContentLength

	rec := httptest.NewRecorder()
	if img, ok := receiveImage(rec, req, maxBytes); ok {
		img.File.Close()
		t.Fatal("accepted a 1 MB upload with a 1 KB limit")
	}

	if limit := maxBytes + multipartOverhead; int64(counter.n) > int64(limit)+4096 {
		t.Errorf("read %d of %d bytes before refusing; want it to stop near the %d-byte limit",
			counter.n, total, limit)
	}
}

func TestReceiveImageRejects(t *testing.T) {
	cases := []struct {
		name     string
		req      func(t *testing.T) *http.Request
		maxBytes int64
		wantCode int
	}{
		{"svg", func(t *testing.T) *http.Request {
			return imageUpload(t, "image", "logo.svg", "image/svg+xml",
				[]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))
		}, 1 << 20, http.StatusBadRequest},
		{"html", func(t *testing.T) *http.Request {
			return imageUpload(t, "image", "x.png", "image/png", []byte("<!DOCTYPE html><html><script>alert(1)</script>"))
		}, 1 << 20, http.StatusBadRequest},
		{"pdf claiming to be a png", func(t *testing.T) *http.Request {
			return imageUpload(t, "image", "x.png", "image/png", []byte("%PDF-1.7\n"))
		}, 1 << 20, http.StatusBadRequest},
		{"wrong field name", func(t *testing.T) *http.Request {
			return imageUpload(t, "file", "x.png", "image/png", pngBytes)
		}, 1 << 20, http.StatusBadRequest},
		// Over maxBytes but inside the multipart slack: caught by the file's
		// own size, after parsing.
		{"over the limit", func(t *testing.T) *http.Request {
			return imageUpload(t, "image", "big.png", "image/png", append(append([]byte{}, pngBytes...), make([]byte, 2<<10)...))
		}, 1 << 10, http.StatusRequestEntityTooLarge},
		// Far over: the MaxBytesReader stops the read before it finishes.
		{"far over the limit", func(t *testing.T) *http.Request {
			return imageUpload(t, "image", "huge.png", "image/png", append(append([]byte{}, pngBytes...), make([]byte, 200<<10)...))
		}, 1 << 10, http.StatusRequestEntityTooLarge},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			img, ok := receiveImage(rec, c.req(t), c.maxBytes)
			if ok {
				img.File.Close()
				t.Fatalf("accepted as %s; want rejected with %d", img.ContentType, c.wantCode)
			}
			if rec.Code != c.wantCode {
				t.Errorf("status %d (%s); want %d", rec.Code, strings.TrimSpace(rec.Body.String()), c.wantCode)
			}
		})
	}
}

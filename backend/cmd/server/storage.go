package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
)

// imageTypes is every upload format accepted, mapped to the extension it is
// stored under. Both the stored Content-Type and the extension come from this
// table, keyed by what the bytes sniff as — never from what the client claims.
// A file that starts with GIF89a<html> sniffs as image/gif, so it is stored as
// a .gif served as image/gif, and a browser renders it as an image, not a page.
//
// SVG is deliberately absent: it is a document that can carry script, and
// http.DetectContentType does not report it as an image anyway.
var imageTypes = map[string]string{
	"image/png":    ".png",
	"image/jpeg":   ".jpg",
	"image/gif":    ".gif",
	"image/webp":   ".webp",
	"image/bmp":    ".bmp",
	"image/x-icon": ".ico",
}

// multipartOverhead is the slack allowed on top of an upload's size limit for
// the multipart envelope around the file — boundaries and part headers.
const multipartOverhead = 64 << 10

// uploadedImage is a validated image upload, ready to store.
type uploadedImage struct {
	File        multipart.File
	ContentType string // sniffed from the bytes
	Ext         string // derived from ContentType
	Name        string // the client's filename — for display only, never a path
}

// receiveImage reads the "image" field of a multipart upload, capped at
// maxBytes, and accepts it only if its bytes are one of imageTypes. It writes
// the error response itself; ok == false means stop. The caller closes File.
//
// ParseMultipartForm's argument only caps how much is held in memory — the
// rest spills to a temp file with no ceiling, and every byte of it then goes
// to the bucket. The MaxBytesReader is what actually limits the size.
func receiveImage(w http.ResponseWriter, r *http.Request, maxBytes int64) (img uploadedImage, ok bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+multipartOverhead)

	if err := r.ParseMultipartForm(maxBytes); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			http.Error(w, fmt.Sprintf("Image must be smaller than %dMB", maxBytes>>20), http.StatusRequestEntityTooLarge)
			return img, false
		}
		http.Error(w, "Could not read the upload", http.StatusBadRequest)
		return img, false
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "No image supplied", http.StatusBadRequest)
		return img, false
	}
	if header.Size > maxBytes {
		file.Close()
		http.Error(w, fmt.Sprintf("Image must be smaller than %dMB", maxBytes>>20), http.StatusRequestEntityTooLarge)
		return img, false
	}

	// Sniff the first 512 bytes. ReadFull, because a single Read may return
	// fewer bytes than are available; a file shorter than 512 bytes is fine.
	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		file.Close()
		http.Error(w, "Could not read the image", http.StatusBadRequest)
		return img, false
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		log.Println(err)
		file.Close()
		http.Error(w, "Could not read the image", http.StatusInternalServerError)
		return img, false
	}

	contentType := http.DetectContentType(head[:n])
	ext, allowed := imageTypes[contentType]
	if !allowed {
		file.Close()
		http.Error(w, "That file type isn't supported. Use a PNG, JPEG, GIF or WebP.", http.StatusBadRequest)
		return img, false
	}

	return uploadedImage{File: file, ContentType: contentType, Ext: ext, Name: header.Filename}, true
}

type UploadImageFile struct {
	URL string `json:"url"`
}

func getPublicSupabaseBucketURL(projectRef, bucketName, filePath string) string {
	return fmt.Sprintf("https://%s.supabase.co/storage/v1/object/public/%s/%s",
		projectRef, bucketName, filePath)
}

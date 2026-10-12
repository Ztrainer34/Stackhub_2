package main

import (
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
)

func isImage(file multipart.File) (bool, error) {
	// Read first 512 bytes to sniff the content type
	buffer := make([]byte, 512)
	_, err := file.Read(buffer)
	if err != nil {
		return false, err
	}
	// Reset the read pointer
	file.Seek(0, io.SeekStart)

	contentType := http.DetectContentType(buffer)

	return strings.HasPrefix(contentType, "image/"), nil
}

type UploadImageFile struct {
	URL string `json:"url"`
}

func getPublicSupabaseBucketURL(projectRef, bucketName, filePath string) string {
	return fmt.Sprintf("https://%s.supabase.co/storage/v1/object/public/%s/%s",
		projectRef, bucketName, filePath)
}

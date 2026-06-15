package crawler

import (
	"net/http"

	"golang.org/x/net/html"
)

type WebsiteMetadata struct {
	Title       *string
	Description *string
}

func CrawlWebsiteForMetadata(url string) WebsiteMetadata {
	client := http.DefaultClient

	resp, err := client.Get(url)
	if err != nil {
		return WebsiteMetadata{}
	}

	document, err := html.Parse(resp.Body)
	if err != nil || document == nil {
		return WebsiteMetadata{}
	}

	return WebsiteMetadata{}
}

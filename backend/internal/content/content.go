// Package content turns stored editor documents into plain text.
package content

import (
	"encoding/json"
	"regexp"
	"strings"
)

// IsJSONObject reports whether raw is a JSON object — the only shape an editor
// document can have. A bare string, number or array is valid JSON but not a
// document, and would be stored and later handed to the renderer.
func IsJSONObject(raw string) bool {
	var obj map[string]json.RawMessage
	return json.Unmarshal([]byte(raw), &obj) == nil && obj != nil
}

// blankLineRun collapses the runs of newlines that flattening a Tiptap document
// leaves behind between nested blocks.
var blankLineRun = regexp.MustCompile(`\n{3,}`)

// PlainText flattens a Tiptap document to plain text. tools.description
// feeds full-text search, the embeddings and the catalogue cards, so it is kept
// as a readable projection of whatever the owner wrote in the rich editor.
//
// Posts use it too, for content_text and draft_content_text. Until October 2026
// they went through an extractor written for Editor.js documents
// (blocks[].data.text), which found nothing in a Tiptap document — so every
// post was stored with an empty content_text, and full-text search never saw a
// post's body. Migration 20261016120000_backfill_post_content_text.sql filled
// in the existing rows.
func PlainText(raw string) string {
	var doc any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return ""
	}

	var b strings.Builder

	// inList keeps list items on consecutive lines while ordinary blocks stay
	// separated by a blank line — the shape parseDescription already expects
	// from the scraped descriptions.
	var walk func(node any, inList bool)
	walk = func(node any, inList bool) {
		n, ok := node.(map[string]any)
		if !ok {
			return
		}

		kind, _ := n["type"].(string)
		switch kind {
		case "text":
			if s, ok := n["text"].(string); ok {
				b.WriteString(s)
			}
		case "hardBreak":
			b.WriteByte('\n')
		}

		if kids, ok := n["content"].([]any); ok {
			for _, kid := range kids {
				walk(kid, inList || kind == "listItem")
			}
		}

		// Block-level nodes end the line they just wrote.
		switch kind {
		case "paragraph", "heading", "blockquote", "codeBlock":
			if inList {
				b.WriteByte('\n')
			} else {
				b.WriteString("\n\n")
			}
		case "bulletList", "orderedList", "taskList":
			b.WriteByte('\n')
		}
	}
	walk(doc, false)

	return strings.TrimSpace(blankLineRun.ReplaceAllString(b.String(), "\n\n"))
}

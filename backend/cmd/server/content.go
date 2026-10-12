package main

import (
	"encoding/json"
	"regexp"
	"strings"
)

func extractTextFromPost(state map[string]interface{}) string {
	blocks, ok := state["blocks"].([]interface{})
	if !ok {
		return ""
	}

	var textSlice []string

	for _, block := range blocks {
		blockMap, ok := block.(map[string]interface{})
		if !ok {
			continue
		}

		data, ok := blockMap["data"].(map[string]interface{})
		if !ok {
			continue
		}

		text, ok := data["text"].(string)
		if ok && len(text) > 0 {
			textSlice = append(textSlice, text)
		}
	}

	return strings.Join(textSlice, "\n")
}

// blankLineRun collapses the runs of newlines that flattening a Tiptap document
// leaves behind between nested blocks.
var blankLineRun = regexp.MustCompile(`\n{3,}`)

// tiptapPlainText flattens a Tiptap document to plain text. tools.description
// feeds full-text search, the embeddings and the catalogue cards, so it is kept
// as a readable projection of whatever the owner wrote in the rich editor.
func tiptapPlainText(raw string) string {
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

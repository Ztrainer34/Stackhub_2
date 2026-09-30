package main

import "testing"

// tiptapPlainText is the bridge between the rich editor and everything that
// reads plain text: full-text search, the embeddings, and the catalogue cards.
// If it flattens badly, a tool edited by its owner quietly becomes harder to
// find — no error, no failing request, just worse search results.
func TestTiptapPlainText(t *testing.T) {
	tests := []struct {
		name string
		doc  string
		want string
	}{
		{
			name: "single paragraph",
			doc:  `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}`,
			want: "Hello",
		},
		{
			name: "paragraphs are separated by a blank line",
			doc: `{"type":"doc","content":[
				{"type":"paragraph","content":[{"type":"text","text":"First."}]},
				{"type":"paragraph","content":[{"type":"text","text":"Second."}]}
			]}`,
			want: "First.\n\nSecond.",
		},
		{
			// parseDescription on the frontend splits on "\n\n", so a heading that
			// ran into its body would render as one undifferentiated block.
			name: "heading is separated from the body",
			doc: `{"type":"doc","content":[
				{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"About Brevo"}]},
				{"type":"paragraph","content":[{"type":"text","text":"Trusted by 500,000 businesses."}]}
			]}`,
			want: "About Brevo\n\nTrusted by 500,000 businesses.",
		},
		{
			// List items sit on consecutive lines, not separated by blank lines —
			// otherwise a six-item list reads as six separate paragraphs.
			name: "list items are on consecutive lines",
			doc: `{"type":"doc","content":[
				{"type":"bulletList","content":[
					{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Email campaigns"}]}]},
					{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"SMS and WhatsApp"}]}]}
				]}
			]}`,
			want: "Email campaigns\nSMS and WhatsApp",
		},
		{
			name: "a list is separated from the paragraph after it",
			doc: `{"type":"doc","content":[
				{"type":"bulletList","content":[
					{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"One"}]}]}
				]},
				{"type":"paragraph","content":[{"type":"text","text":"After."}]}
			]}`,
			want: "One\n\nAfter.",
		},
		{
			name: "hard breaks stay inside the paragraph",
			doc: `{"type":"doc","content":[{"type":"paragraph","content":[
				{"type":"text","text":"Line one"},{"type":"hardBreak"},{"type":"text","text":"line two"}
			]}]}`,
			want: "Line one\nline two",
		},
		{
			name: "marks do not interrupt the text",
			doc: `{"type":"doc","content":[{"type":"paragraph","content":[
				{"type":"text","text":"Plain "},
				{"type":"text","marks":[{"type":"bold"}],"text":"bold"},
				{"type":"text","text":" tail"}
			]}]}`,
			want: "Plain bold tail",
		},
		{
			// The owner cleared the editor. An empty description is correct; a
			// panic or a stray newline is not.
			name: "empty document yields an empty string",
			doc:  `{"type":"doc","content":[{"type":"paragraph"}]}`,
			want: "",
		},
		{
			// A malformed body must not take the request down — the handler stores
			// whatever comes back, and "" is the honest answer.
			name: "invalid JSON yields an empty string",
			doc:  `not json at all`,
			want: "",
		},
		{
			name: "runs of blank lines collapse to one",
			doc: `{"type":"doc","content":[
				{"type":"paragraph","content":[{"type":"text","text":"A"}]},
				{"type":"paragraph"},
				{"type":"paragraph"},
				{"type":"paragraph","content":[{"type":"text","text":"B"}]}
			]}`,
			want: "A\n\nB",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := tiptapPlainText(tc.doc)
			if got != tc.want {
				t.Errorf("tiptapPlainText()\n got: %q\nwant: %q", got, tc.want)
			}
		})
	}
}

// resolveToolID's UUID branch is reachable without a database: a well-formed
// UUID short-circuits before any query runs. The slug branch needs Postgres and
// is left to the running app.
func TestOptionalText(t *testing.T) {
	tests := []struct {
		name      string
		in        string
		wantValid bool
		wantText  string
	}{
		{"a value is stored", "Paris", true, "Paris"},
		{"surrounding whitespace is trimmed", "  Paris  ", true, "Paris"},
		{"empty becomes NULL, not an empty string", "", false, ""},
		{"whitespace-only becomes NULL", "   ", false, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := optionalText(tc.in)
			if got.Valid != tc.wantValid {
				t.Errorf("optionalText(%q).Valid = %v, want %v", tc.in, got.Valid, tc.wantValid)
			}
			if got.Valid && got.String != tc.wantText {
				t.Errorf("optionalText(%q).String = %q, want %q", tc.in, got.String, tc.wantText)
			}
		})
	}
}

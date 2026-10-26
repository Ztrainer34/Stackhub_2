package post

import (
	"strconv"
	"strings"
	"testing"

	"github.com/google/uuid"

	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
	"stackhub.com/stackhub/internal/ticket"
)

func TestValidateNewPost(t *testing.T) {
	tool := uuid.New()
	tools := func(n int) []uuid.UUID {
		out := make([]uuid.UUID, n)
		for i := range out {
			out[i] = uuid.New()
		}
		return out
	}
	suggest := func(n int) []ticket.Suggestion {
		out := make([]ticket.Suggestion, n)
		for i := range out {
			out[i] = ticket.Suggestion{Name: "Tool " + strconv.Itoa(i)}
		}
		return out
	}
	type form = CreatePostWithSuggestedToolsForm

	rejected := []struct {
		name string
		form form
		msg  string
	}{
		{"blank name", form{Type: "playbook", Name: " \t ", Tools: []uuid.UUID{tool}}, "Post name cannot be empty"},
		{"blank name is reported before missing tools", form{Type: "nope", Name: ""}, "Post name cannot be empty"},
		{"201-character name", form{Type: "playbook", Name: strings.Repeat("é", 201), Tools: []uuid.UUID{tool}}, "Post name must be at most 200 characters"},
		{"1001-character goal", form{Type: "playbook", Name: "x", Description: strings.Repeat("a", 1001), Tools: []uuid.UUID{tool}}, "Goal must be at most 1000 characters"},
		{"nameless suggestion", form{Type: "playbook", Name: "x", SuggestedTools: []ticket.Suggestion{{Name: " "}}}, "Tool name is required"},
		{"javascript suggestion website", form{Type: "playbook", Name: "x", SuggestedTools: []ticket.Suggestion{{Name: "T", Website: "javascript:alert(1)"}}}, "Tool website must be an http or https address"},
		{"bad suggestion is reported before a bad type", form{Type: "nope", Name: "x", SuggestedTools: []ticket.Suggestion{{Name: ""}}}, "Tool name is required"},
		{"no tools at all", form{Type: "playbook", Name: "x"}, "Missing tools"},
		{"missing tools is reported before a bad type", form{Type: "nope", Name: "x"}, "Missing tools"},
		{"comparison of one tool", form{Type: "comparison", Name: "x", Tools: []uuid.UUID{tool}}, "Comparisons require at least two tools or tool suggestions"},
		{"comparison of one suggestion", form{Type: "comparison", Name: "x", SuggestedTools: suggest(1)}, "Comparisons require at least two tools or tool suggestions"},
		{"playbook of eleven", form{Type: "playbook", Name: "x", Tools: tools(11)}, "Too many tools (maximum 10)"},
		{"eleven counting suggestions", form{Type: "playbook", Name: "x", Tools: tools(6), SuggestedTools: suggest(5)}, "Too many tools (maximum 10)"},
		{"comparison of eleven", form{Type: "comparison", Name: "x", Tools: tools(11)}, "Too many tools (maximum 10)"},
		{"combo", form{Type: "combo", Name: "x", Tools: []uuid.UUID{tool}}, "Unknown post type"},
		{"type is case-sensitive", form{Type: "Playbook", Name: "x", Tools: []uuid.UUID{tool}}, "Unknown post type"},
		{"unknown experience level", form{Type: "playbook", Name: "x", Tools: []uuid.UUID{tool}, ExperienceLevel: "expert"}, "Unknown experience level"},
	}
	for _, c := range rejected {
		_, err := validateNewPost(c.form)
		apperrtest.Want(t, c.name, err, apperr.KindInvalid, c.msg)
	}

	accepted := []struct {
		name string
		form form
	}{
		{"playbook of one", form{Type: "playbook", Name: "x", Tools: []uuid.UUID{tool}}},
		{"playbook of ten", form{Type: "playbook", Name: "x", Tools: tools(10)}},
		{"playbook of one suggestion only", form{Type: "playbook", Name: "x", SuggestedTools: suggest(1)}},
		{"comparison of a tool and a suggestion", form{Type: "comparison", Name: "x", Tools: []uuid.UUID{tool}, SuggestedTools: suggest(1)}},
		{"comparison of ten", form{Type: "comparison", Name: "x", Tools: tools(4), SuggestedTools: suggest(6)}},
		{"200-character name", form{Type: "playbook", Name: strings.Repeat("é", 200), Tools: []uuid.UUID{tool}}},
		{"1000-character goal", form{Type: "playbook", Name: "x", Description: strings.Repeat("a", 1000), Tools: []uuid.UUID{tool}}},
	}
	for _, c := range accepted {
		if _, err := validateNewPost(c.form); err != nil {
			t.Errorf("%s: rejected with %v", c.name, err)
		}
	}

	t.Run("normalises without touching the caller's form", func(t *testing.T) {
		in := form{
			Type: "comparison", Name: "  My Post  ", Tools: []uuid.UUID{tool},
			SuggestedTools:  []ticket.Suggestion{{Name: "  New Tool ", Website: " example.com ", Categories: []int{3}}},
			ExperienceLevel: " BEGINNER ",
		}
		got, err := validateNewPost(in)
		if err != nil {
			t.Fatal(err)
		}
		if got.form.Name != "My Post" {
			t.Errorf("name %q; want trimmed", got.form.Name)
		}
		s := got.form.SuggestedTools[0]
		if s.Name != "New Tool" || s.Website != "https://example.com" || len(s.Categories) != 1 {
			t.Errorf("suggestion = %+v; want trimmed name, https website, categories kept", s)
		}
		if !got.experienceLevel.Valid || got.experienceLevel.String != "beginner" {
			t.Errorf("experience level = %+v; want beginner", got.experienceLevel)
		}
		if in.Name != "  My Post  " || in.SuggestedTools[0].Name != "  New Tool " || in.SuggestedTools[0].Website != " example.com " {
			t.Errorf("caller's form was modified: %+v", in)
		}
	})

	t.Run("no experience level stores NULL", func(t *testing.T) {
		got, err := validateNewPost(form{Type: "playbook", Name: "x", Tools: []uuid.UUID{tool}, ExperienceLevel: "   "})
		if err != nil || got.experienceLevel.Valid {
			t.Errorf("blank level = %+v, %v; want NULL", got.experienceLevel, err)
		}
	})
}

package onboarding

import (
	"slices"
	"strings"
	"testing"
)

// The subcategories of the two-level structure (frontend/scripts/import-categories.mjs).
var subcategories = []string{
	"Contact data & email finder", "Account & lead research", "Web scraping", "Enrichment & waterfall",
	"Company data & firmographics", "Email & phone verification", "Technographics", "Job change data",
	"Intent & buyer signals", "Competitive & market intelligence", "Website visitor ID",
	"Cold email & sequencers", "Email deliverability", "LinkedIn automation", "Dialers & cold calling",
	"AI SDRs", "Video & direct mail prospecting", "Revenue intelligence & forecasting", "CRM",
	"Lead routing & data hygiene", "Sales comp & CPQ", "AI sales assistants & copilots", "Meeting notetakers",
	"Enablement & training", "Digital sales rooms & demos", "Proposals & documents", "Scheduling",
	"Coaching & conversation intelligence", "Copywriting & content", "Social media & reputation", "SEO & GEO",
	"Email marketing", "Landing pages & forms", "ABM", "Paid ads", "Marketing automation",
	"Affiliate, partner & influencer", "Attribution & analytics", "Events & webinars", "AI agents & builders",
	"LLMs & AI infrastructure", "Workflow automation", "No-code & app builders", "Integrations & iPaaS",
	"AI coding assistants", "Help desk & support", "Customer success", "Chatbots & live chat", "Community",
	"Phone & contact center", "Web & digital analytics", "Product analytics", "CDP & data pipelines",
	"A/B testing & CRO", "Video", "Image", "Design", "Audio & voice", "Presentations", "Team chat & email",
	"Docs, notes & knowledge", "Project management", "Whiteboards & diagrams", "Billing, spend & accounting",
	"Contracts & e-signature", "HR & recruiting", "Databases & dev tools", "Hosting & cloud",
}

// matches mirrors the query's `name ILIKE '%keyword%'`.
func matches(area string) []string {
	var out []string
	for _, name := range subcategories {
		for _, kw := range focusAreaKeywords[area] {
			if strings.Contains(strings.ToLower(name), strings.ToLower(kw)) {
				out = append(out, name)
				break
			}
		}
	}
	return out
}

func TestFocusAreaKeywords(t *testing.T) {
	for area := range focusAreaKeywords {
		if len(matches(area)) == 0 {
			t.Errorf("%q matches no category: it would suggest nothing", area)
		}
	}

	// Near misses: a loose keyword that pulls in an unrelated category.
	for area, unwanted := range map[string]string{
		"Prospecting Databases & TAM Sourcing":    "Databases & dev tools",
		"Technographic & Job Intelligence":        "HR & recruiting",
		"Waterfall Contact Enrichment":            "Phone & contact center",
		"Personalized Video Outreach":             "Video",
		"Deal Intelligence & Risk Inspection":     "CDP & data pipelines",
		"AI Sales Co-Pilots & Meeting Assistants": "AI coding assistants",
	} {
		if slices.Contains(matches(area), unwanted) {
			t.Errorf("%q matches %q", area, unwanted)
		}
	}
	if slices.Contains(matches("AI Sales Co-Pilots & Meeting Assistants"), "Docs, notes & knowledge") {
		t.Error("the meeting assistants area matches a notes category")
	}
}

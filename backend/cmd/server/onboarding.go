package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"stackhub.com/stackhub/pkg/db"
	"stackhub.com/stackhub/pkg/mail"
)

// getFeed returns the viewer's activity feed: playbooks published by the people
// and about the tools they follow, plus the follow actions of people they
// follow. Recent playbooks are blended in so a new account still sees content.
// ---- onboarding -----------------------------------------------------------

// onboardingFocusAreas is the curated GTM taxonomy shown on the "What's your
// focus?" step. It is deliberately app-owned rather than rows in `categories`,
// which holds the far more granular vendor-directory categories.
var onboardingFocusAreas = []string{
	"Website Visitor De-Anonymization",
	"Intent Signal Monitoring",
	"Prospecting Databases & TAM Sourcing",
	"Social & Community Intelligence",
	"Technographic & Job Intelligence",
	"Waterfall Contact Enrichment",
	"Email Verification & Scrubbing",
	"Web Scraping & Custom Data Extraction",
	"Account-Based Marketing (ABM) Platforms",
	"AI BDRs & Autonomous Agents",
	"Cold Email Sequencing",
	"Email Deliverability & Infrastructure",
	"LinkedIn Outreach Automation",
	"Multichannel Sales Engagement",
	"Personalized Video Outreach",
	"AI Sales Copy Generators",
	"AI-Powered CRMs",
	"Inbound Lead Routing & Scheduling",
	"RevOps & Data Warehousing",
	"GTM Workflow Automation & Middleware",
	"Conversation Intelligence",
	"AI Sales Co-Pilots & Meeting Assistants",
	"Digital Sales Rooms (DSR)",
	"Deal Intelligence & Risk Inspection",
	"AI Revenue Forecasting",
	"Product-Led Growth (PLG) & Product Data",
	"Customer Success & Churn Management",
	"Ecosystem & Partner-Led Growth Tech",
	"Programmatic AI Content & SEO",
	"Pipeline Attribution & Ad Intelligence",
}

// onboardingToolNames are the popular GTM tools offered on the "What's your GTM
// stack?" step, keyed by the exact catalog name so each tile can show the real
// logo. A few differ from the marketing name (Salesforce is stored as
// "Salesforce Platform"); the display label comes from the catalog row.
// onboardingToolLimit caps the grid so it stays scannable.
const onboardingToolLimit = 96

var onboardingToolNames = []string{
	"11x", "6Sense", "Apollo.io", "Artisan", "Attention", "Attio",
	"BetterContact", "Bouncer", "BuiltWith", "Calendly", "Chili Piper",
	"Chorus (ZoomInfo)", "Clay", "Clearbit", "Close", "Cognism", "Common Room",
	"Correlated", "Crossbeam", "Debounce", "Default", "Demandbase", "Dock",
	"Exa.ai", "Expandi", "Fathom", "Findymail", "Fireflies", "FullEnrich",
	"Gong", "HeyReach", "Hightouch", "HockeyStack", "HubSpot",
	"Influencers.club", "Instantly", "Jasper", "Koala", "LeadIQ", "Lemlist",
	"LinkedIn Sales Navigator", "Lusha", "Mailreach", "Make", "n8n",
	"Ocean.io", "Outreach", "PandaDoc", "People Data Labs", "PhantomBuster",
	"Pipedrive", "Pocus", "PredictLeads", "Prospeo", "RB2B", "Reply",
	"Salesforce Platform", "Salesloft", "Scrubby", "Sendspark", "Smartlead",
	"Sybill", "Tavus", "TheirStack", "Topo", "Wappalyzer", "Warmly", "Wiza",
	"Zapier", "ZeroBounce", "ZoomInfo Marketing",
}

// focusAreaKeywords maps each curated focus area to loose patterns matched
// against the (very granular, ~1700-strong) category names in the catalog.
// Deliberately broad: the goal is "show me tools in roughly this space", not a
// precise taxonomy.
var focusAreaKeywords = map[string][]string{
	"Website Visitor De-Anonymization":        {"visitor", "deanonym", "de-anonym", "website intelligence"},
	"Intent Signal Monitoring":                {"intent", "buyer signal", "signal"},
	"Prospecting Databases & TAM Sourcing":    {"prospect", "database", "data provider", "lead intelligence", "lead generation"},
	"Social & Community Intelligence":         {"social", "community"},
	"Technographic & Job Intelligence":        {"technograph", "job", "hiring", "recruit"},
	"Waterfall Contact Enrichment":            {"enrich", "contact data", "email finder", "phone"},
	"Email Verification & Scrubbing":          {"email verif", "email validation", "verification"},
	"Web Scraping & Custom Data Extraction":   {"scrap", "crawl", "extraction", "web data"},
	"Account-Based Marketing (ABM) Platforms": {"account-based", "abm", "account research", "account intelligence"},
	"AI BDRs & Autonomous Agents":             {"bdr", "sdr", "agent", "autonomous"},
	"Cold Email Sequencing":                   {"cold email", "email outreach", "sequenc", "email campaign"},
	"Email Deliverability & Infrastructure":   {"deliverab", "inbox", "warmup", "warm-up", "smtp"},
	"LinkedIn Outreach Automation":            {"linkedin"},
	"Multichannel Sales Engagement":           {"sales engagement", "multichannel", "multi-channel", "outreach"},
	"Personalized Video Outreach":             {"video", "personaliz"},
	"AI Sales Copy Generators":                {"copywriting", "content writing", "copy generat"},
	"AI-Powered CRMs":                         {"crm"},
	"Inbound Lead Routing & Scheduling":       {"routing", "scheduling", "calendar", "appointment", "inbound"},
	"RevOps & Data Warehousing":               {"revops", "revenue operations", "warehouse", "data ops", "etl"},
	"GTM Workflow Automation & Middleware":    {"workflow", "automation", "integration", "orchestrat"},
	"Conversation Intelligence":               {"conversation", "call record", "call track", "revenue intelligence"},
	"AI Sales Co-Pilots & Meeting Assistants": {"copilot", "co-pilot", "meeting", "assistant", "notetak", "notes"},
	"Digital Sales Rooms (DSR)":               {"sales room", "proposal", "enablement", "deal room"},
	"Deal Intelligence & Risk Inspection":     {"deal", "pipeline", "risk"},
	"AI Revenue Forecasting":                  {"forecast", "revenue"},
	"Product-Led Growth (PLG) & Product Data": {"product analytics", "product-led", "product led", "product data"},
	"Customer Success & Churn Management":     {"customer success", "churn", "retention", "customer support"},
	"Ecosystem & Partner-Led Growth Tech":     {"partner", "ecosystem"},
	"Programmatic AI Content & SEO":           {"seo", "content", "search engine"},
	"Pipeline Attribution & Ad Intelligence":  {"attribution", "advertis", " ads", "ad intelligence"},
}

// getOnboardingOptions returns everything the onboarding screens need: the
// focus areas, and the popular tools resolved to real catalog rows with logos.
type onboardingTool struct {
	ID      uuid.UUID   `json:"id"`
	Name    string      `json:"name"`
	LogoUrl pgtype.Text `json:"logo_url"`
}

func (app *App) getOnboardingOptions(w http.ResponseWriter, r *http.Request) {
	lowered := make([]string, len(onboardingToolNames))
	for i, n := range onboardingToolNames {
		lowered[i] = strings.ToLower(n)
	}

	curated, err := app.queries.GetToolsByNames(r.Context(), lowered)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to load onboarding tools", http.StatusInternalServerError)
		return
	}

	// The popular tools always lead; anything matching the user's chosen focus
	// areas is appended so the step reflects what they said they care about.
	tools := make([]onboardingTool, 0, onboardingToolLimit)
	seen := map[uuid.UUID]bool{}
	for _, t := range curated {
		if seen[t.ID] {
			continue
		}
		seen[t.ID] = true
		tools = append(tools, onboardingTool{ID: t.ID, Name: t.Name, LogoUrl: t.LogoUrl})
	}

	var patterns []string
	for _, area := range r.URL.Query()["focus"] {
		for _, kw := range focusAreaKeywords[area] {
			patterns = append(patterns, "%"+kw+"%")
		}
	}

	if len(patterns) > 0 && len(tools) < onboardingToolLimit {
		matched, matchErr := app.queries.GetToolsByCategoryKeywords(r.Context(), db.GetToolsByCategoryKeywordsParams{
			Patterns: patterns,
			Lim:      int32(onboardingToolLimit * 3),
		})
		if matchErr != nil {
			log.Println(matchErr) // personalisation is best-effort; keep the curated list
		}
		for _, t := range matched {
			if len(tools) >= onboardingToolLimit {
				break
			}
			if seen[t.ID] {
				continue
			}
			seen[t.ID] = true
			tools = append(tools, onboardingTool{ID: t.ID, Name: t.Name, LogoUrl: t.LogoUrl})
		}
	}

	sort.Slice(tools, func(i, j int) bool {
		return strings.ToLower(tools[i].Name) < strings.ToLower(tools[j].Name)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		FocusAreas []string         `json:"focus_areas"`
		Tools      []onboardingTool `json:"tools"`
	}{
		FocusAreas: onboardingFocusAreas,
		Tools:      tools,
	})
}

// saveOnboarding stores the chosen focus areas and adds the selected tools to
// the user's stack, completing the multi-step flow in one call.
func (app *App) saveOnboarding(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)
	defer r.Body.Close()

	var form struct {
		FocusAreas []string `json:"focus_areas"`
		ToolIDs    []string `json:"tool_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&form); err != nil {
		log.Println(err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Only accept focus areas from the curated list.
	allowed := make(map[string]bool, len(onboardingFocusAreas))
	for _, f := range onboardingFocusAreas {
		allowed[f] = true
	}
	focus := make([]string, 0, len(form.FocusAreas))
	for _, f := range form.FocusAreas {
		if allowed[f] {
			focus = append(focus, f)
		}
	}

	// Each tool costs two queries inside one transaction, so an uncapped list
	// let one request hold a pooled connection for ~100k round trips. The
	// picker offers at most onboardingToolLimit tools; anything past that, and
	// any duplicate or malformed id, is dropped.
	toolIDs := make([]uuid.UUID, 0, len(form.ToolIDs))
	seen := make(map[uuid.UUID]bool, len(form.ToolIDs))
	for _, raw := range form.ToolIDs {
		if len(toolIDs) == onboardingToolLimit {
			break
		}
		toolID, parseErr := uuid.Parse(raw)
		if parseErr != nil || seen[toolID] {
			continue // ignore malformed ids rather than failing the whole step
		}
		seen[toolID] = true
		toolIDs = append(toolIDs, toolID)
	}

	tx, err := app.db.Begin(r.Context())
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to start transaction", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := app.queries.WithTx(tx)

	err = qtx.SetProfileFocusAreas(r.Context(), db.SetProfileFocusAreasParams{
		FocusAreas: focus,
		ProfileID:  userID,
	})
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to save your focus areas", http.StatusInternalServerError)
		return
	}

	for _, toolID := range toolIDs {
		if err := qtx.AddToStack(r.Context(), db.AddToStackParams{
			ProfileID: userID,
			ToolID:    toolID,
		}); err != nil {
			log.Println(err)
			http.Error(w, "Failed to add tools to your stack", http.StatusInternalServerError)
			return
		}
		// Same rule as addToStack: stacking a tool follows it.
		if err := qtx.FollowTool(r.Context(), db.FollowToolParams{
			ProfileID: userID,
			ToolID:    toolID,
		}); err != nil {
			log.Println(err)
			http.Error(w, "Failed to add tools to your stack", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Println(err)
		http.Error(w, "Failed to commit", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// OnboardingRequest represents the request payload for onboarding
type OnboardingRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

func (app *App) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	userID := extractUserIDFromRequest(r)
	defer r.Body.Close()

	var req OnboardingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println(err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Usernames are case-insensitive: normalize to lowercase so "Max" and "max"
	// are the same account.
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))

	// Validate username
	if req.Username == "" {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}
	if problem := usernameProblem(req.Username); problem != "" {
		http.Error(w, problem, http.StatusBadRequest)
		return
	}
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if tooLong(req.DisplayName, maxDisplayNameLen) {
		http.Error(w, fmt.Sprintf("Display name must be at most %d characters", maxDisplayNameLen), http.StatusBadRequest)
		return
	}

	// Check if username is available
	available, err := app.queries.CheckUsernameAvailable(r.Context(), req.Username)
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to check username availability", http.StatusInternalServerError)
		return
	}

	if !available {
		http.Error(w, "Username is already taken", http.StatusConflict)
		return
	}

	// Update profile with onboarding completion
	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Username
	}

	profile, err := app.queries.CreateProfile(r.Context(), db.CreateProfileParams{
		ID:          userID,
		Username:    req.Username,
		DisplayName: displayName,
	})

	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to complete onboarding", http.StatusInternalServerError)
		return
	}

	// Send the welcome email for Google (OAuth) sign-ups only. Magic-link
	// users already receive a welcome as part of their sign-up email, so
	// sending here too would double up.
	if _, claims, claimsErr := jwtauth.FromContext(r.Context()); claimsErr == nil {
		email, _ := claims["email"].(string)
		provider := ""
		if appMetadata, ok := claims["app_metadata"].(map[string]interface{}); ok {
			provider, _ = appMetadata["provider"].(string)
		}
		if provider == "google" && email != "" && app.mailer != nil {
			go func(to, name string) {
				if err := app.mailer.SendWelcome(context.Background(), to, mail.WelcomeData{FirstName: name}); err != nil {
					log.Println("failed to send welcome email:", err)
				}
			}(email, displayName)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(profile)
}

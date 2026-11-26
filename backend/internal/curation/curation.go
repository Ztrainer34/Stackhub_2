// Package curation holds editorial decisions about what the public showcases
// (rankings, featured stacks, trending playbooks) are built from.
package curation

// excludedUsernames are test accounts. They never appear in, and never count
// towards, the public showcases: featured stacks, trending playbooks (as author
// or as the person who starred), the rankings counts (stacks, playbooks, saved,
// stack counts per category) and the "used by" avatars.
//
// Nothing is deleted or hidden elsewhere: their profiles, stacks and posts
// still work for their owners. Usernames are stored lowercase.
var excludedUsernames = []string{
	"max_cz",
	"max_sw",
	"zia",
	"shtest",
	"hadi2",
	"test1",
	"lfiorini",
}

// ExcludedUsernames returns a fresh copy of the excluded usernames, to pass as
// the `excluded` argument of the showcase queries
// (p.username <> ALL(sqlc.arg(excluded)::text[])).
//
// It is never nil or empty: an empty slice would reach Postgres as an empty
// array (still correct), but a nil one becomes NULL, and x <> ALL(NULL) is NULL
// for every row, which would filter the whole showcase out.
func ExcludedUsernames() []string {
	out := make([]string, len(excludedUsernames))
	copy(out, excludedUsernames)
	return out
}

package tool

import (
	"testing"

	"stackhub.com/stackhub/internal/apperr"
	"stackhub.com/stackhub/internal/apperr/apperrtest"
)

func TestValidateToolPageUpdate(t *testing.T) {
	ptr := func(s string) *string { return &s }
	cats := func(n int) *[]int32 {
		c := make([]int32, n)
		return &c
	}

	rejected := []struct {
		name string
		form UpdateToolPageRequest
		msg  string
	}{
		{"thirteen categories", UpdateToolPageRequest{CategoryIDs: cats(13)}, "A tool can have at most 12 categories"},
		{"script logo", UpdateToolPageRequest{LogoURL: ptr("javascript:alert(1)")}, "Logo URL must be an http or https address"},
		{"script website", UpdateToolPageRequest{Vendor: &ToolVendorInput{Website: "javascript:alert(1)"}}, "Website must be an http or https address"},
		{"script linkedin", UpdateToolPageRequest{Vendor: &ToolVendorInput{LinkedinProfile: "data:text/html,x"}}, "LinkedIn profile must be an http or https address"},
		{"categories are checked first", UpdateToolPageRequest{CategoryIDs: cats(13), LogoURL: ptr("javascript:x")}, "A tool can have at most 12 categories"},
	}
	for _, c := range rejected {
		_, err := validateToolPageUpdate(c.form)
		apperrtest.Want(t, c.name, err, apperr.KindInvalid, c.msg)
	}

	if _, err := validateToolPageUpdate(UpdateToolPageRequest{CategoryIDs: cats(12)}); err != nil {
		t.Errorf("twelve categories rejected: %v", err)
	}
	if _, err := validateToolPageUpdate(UpdateToolPageRequest{}); err != nil {
		t.Errorf("an empty edit rejected: %v", err)
	}

	t.Run("x_profile is a handle, not a URL", func(t *testing.T) {
		got, err := validateToolPageUpdate(UpdateToolPageRequest{Vendor: &ToolVendorInput{XProfile: "@acme"}})
		if err != nil || got.Vendor.XProfile != "@acme" {
			t.Errorf("x_profile = %+v, %v; want kept as written", got.Vendor, err)
		}
	})

	t.Run("normalises without touching the caller's form", func(t *testing.T) {
		in := UpdateToolPageRequest{
			LogoURL: ptr(" example.com/logo.png "),
			Vendor:  &ToolVendorInput{Website: "acme.example", LinkedinProfile: "linkedin.com/company/acme"},
		}
		got, err := validateToolPageUpdate(in)
		if err != nil {
			t.Fatal(err)
		}
		if *got.LogoURL != "https://example.com/logo.png" || got.Vendor.Website != "https://acme.example" ||
			got.Vendor.LinkedinProfile != "https://linkedin.com/company/acme" {
			t.Errorf("normalised = logo %q, vendor %+v", *got.LogoURL, got.Vendor)
		}
		if *in.LogoURL != " example.com/logo.png " || in.Vendor.Website != "acme.example" {
			t.Errorf("caller's form was modified: logo %q, vendor %+v", *in.LogoURL, in.Vendor)
		}
	})
}

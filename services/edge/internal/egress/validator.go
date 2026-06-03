// Package egress implements the structural payload cap for managed-mode egress
// enforcement (AQ-01 resolution, THREAT_MODEL §3 Option C, INV-EGR-03a).
//
// Enforcement model:
//
//  1. Every AI request carries X-Egress-Level: "redacted" | "full".
//  2. For "redacted" requests: the edge validates that the payload body conforms
//     to the aggregate-only schema (FR-CONSENT-07 / INV-EGR-01 ceiling). Any
//     payload containing fields that can only appear in full-egress contexts
//     (individual transaction amounts, dates, merchant names, free-text notes) is
//     REJECTED with 400. The client's claimed egress level is not trusted —
//     the payload is inspected structurally.
//  3. For "full" requests: the edge requires a valid, server-signed, short-lived
//     consent assertion (consent package). Without a valid assertion, the request
//     is treated as "redacted" (fail-safe default, THREAT_MODEL §3 step 3).
//  4. Schema definitions for redacted-egress payloads are versioned here.
//     Additions to the aggregate-only schema require an edge deployment.
//
// This package does NOT interpret financial semantics — it enforces schema shape.
// No domain logic lives on the edge (Gate-4 decision 16).
package egress

import (
	"encoding/json"
	"fmt"
)

// fullEgressOnlyFields are keys that may only appear in a full-egress payload
// (INV-EGR-01: raw transaction data). Their presence in a redacted-egress payload
// is a schema violation — reject with 400.
//
// This list is the enforcement contract between the client's AI Context Builder
// and the edge. Additions here require a coordinated client + edge deployment.
var fullEgressOnlyFields = []string{
	"transaction_amount",
	"transaction_date",
	"merchant",
	"merchant_name",
	"note",
	"free_text",
	"transactions",       // array of individual transactions
	"raw_transactions",
}

// Validator enforces egress schema shape at the edge boundary.
type Validator struct{}

// NewValidator constructs a Validator.
func NewValidator() *Validator { return &Validator{} }

// Validate checks that the payload conforms to the permitted egress level.
//
//   - egressLevel "redacted": payload must not contain fullEgressOnlyFields.
//   - egressLevel "full": a valid assertionJSON must accompany the request
//     (validated separately by the consent package before this call).
//
// Returns a non-nil error with a descriptive message on violation.
// On error the handler must return 400 to the client (INV-EGR-03a).
func (v *Validator) Validate(egressLevel string, payload json.RawMessage) error {
	switch egressLevel {
	case "redacted", "":
		return v.validateRedacted(payload)
	case "full":
		// For full-egress the consent assertion is validated separately by the
		// consent package. Here we only confirm the payload is well-formed.
		// TODO(impl): add any full-egress structural constraints (e.g. max payload
		// size) if required by the spec.
		if !json.Valid(payload) {
			return fmt.Errorf("egress: full-egress payload is not valid JSON")
		}
		return nil
	default:
		// Unknown egress level — fail safe to redacted validation.
		return v.validateRedacted(payload)
	}
}

// validateRedacted rejects payloads that contain full-egress-only fields.
// The check is structural (field key presence), not semantic (field value meaning).
// This is intentional: the edge does not interpret financial data (Gate-4 decision 16).
func (v *Validator) validateRedacted(payload json.RawMessage) error {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(payload, &m); err != nil {
		return fmt.Errorf("egress: payload is not a JSON object: %w", err)
	}

	for _, forbidden := range fullEgressOnlyFields {
		if _, found := m[forbidden]; found {
			return fmt.Errorf("egress: redacted-egress payload contains forbidden field %q (INV-EGR-01): full-egress consent required", forbidden)
		}
	}
	return nil
}

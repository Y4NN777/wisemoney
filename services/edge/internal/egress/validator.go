// Package egress implements the structural payload cap for managed-mode egress
// enforcement (AQ-01 resolution, THREAT_MODEL §3 Option C, INV-EGR-03a).
//
// Enforcement model:
//
//  1. Every managed AI request must conform
//     to the aggregate-only schema (FR-CONSENT-07 / INV-EGR-01 ceiling). Any
//     payload containing fields that can only appear in full-egress contexts
//     (individual transaction amounts, dates, merchant names, free-text notes) is
//     REJECTED with 400. The client's claimed egress level is not trusted —
//     the payload is inspected structurally.
//  2. Schema definitions for redacted-egress payloads are versioned here.
//     Additions to the aggregate-only schema require an edge deployment.
//
// This package does NOT interpret financial semantics — it enforces schema shape.
// No domain logic lives on the edge (Gate-4 decision 16).
package egress

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
)

var currencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

const maxSafeInteger int64 = 9_007_199_254_740_991

type redactedMoney struct {
	MinorUnits int64  `json:"minorUnits"`
	Currency   string `json:"currency"`
}

type redactedPayload struct {
	PeriodTotalsPerCategory map[string]redactedMoney `json:"periodTotalsPerCategory"`
	TotalIncome             redactedMoney            `json:"totalIncome"`
	TotalExpenses           redactedMoney            `json:"totalExpenses"`
	NetCashFlow             redactedMoney            `json:"netCashFlow"`
	BudgetStatusPercent     map[string]float64       `json:"budgetStatusPercent"`
	GoalProgressPercent     map[string]float64       `json:"goalProgressPercent"`
	TrendDirection          map[string]string        `json:"trendDirection"`
}

// Validator enforces egress schema shape at the edge boundary.
type Validator struct{}

// NewValidator constructs a Validator.
func NewValidator() *Validator { return &Validator{} }

// Validate checks that a managed payload matches the aggregate-only schema.
// Returns a non-nil error with a descriptive message on violation.
// On error the handler must return 400 to the client (INV-EGR-03a).
func (v *Validator) Validate(payload json.RawMessage) error {
	return v.validateRedacted(payload)
}

// validateRedacted enforces the exact aggregate-only payload schema.
func (v *Validator) validateRedacted(payload json.RawMessage) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return fmt.Errorf("egress: payload is not a JSON object: %w", err)
	}
	required := []string{
		"periodTotalsPerCategory",
		"totalIncome",
		"totalExpenses",
		"netCashFlow",
		"budgetStatusPercent",
		"goalProgressPercent",
		"trendDirection",
	}
	for _, field := range required {
		if _, exists := fields[field]; !exists {
			return fmt.Errorf("egress: redacted-egress payload is missing required field %q", field)
		}
	}

	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var decoded redactedPayload
	if err := decoder.Decode(&decoded); err != nil {
		return fmt.Errorf("egress: redacted-egress payload violates aggregate-only schema: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return err
	}
	if decoded.PeriodTotalsPerCategory == nil || decoded.BudgetStatusPercent == nil ||
		decoded.GoalProgressPercent == nil || decoded.TrendDirection == nil {
		return fmt.Errorf("egress: aggregate maps must be JSON objects")
	}

	for categoryID, amount := range decoded.PeriodTotalsPerCategory {
		if categoryID == "" {
			return fmt.Errorf("egress: category id must not be empty")
		}
		if err := validateRedactedMoney(amount); err != nil {
			return fmt.Errorf("egress: category %q: %w", categoryID, err)
		}
	}
	for name, amount := range map[string]redactedMoney{
		"totalIncome":   decoded.TotalIncome,
		"totalExpenses": decoded.TotalExpenses,
		"netCashFlow":   decoded.NetCashFlow,
	} {
		if err := validateRedactedMoney(amount); err != nil {
			return fmt.Errorf("egress: %s: %w", name, err)
		}
	}
	for name, values := range map[string]map[string]float64{
		"budgetStatusPercent": decoded.BudgetStatusPercent,
		"goalProgressPercent": decoded.GoalProgressPercent,
	} {
		for id, percentage := range values {
			if id == "" || percentage < 0 {
				return fmt.Errorf("egress: %s contains invalid percentage", name)
			}
		}
	}
	for id, trend := range decoded.TrendDirection {
		if id == "" || (trend != "up" && trend != "down" && trend != "stable") {
			return fmt.Errorf("egress: trendDirection contains invalid value")
		}
	}
	return nil
}

func validateRedactedMoney(amount redactedMoney) error {
	if amount.MinorUnits < -maxSafeInteger || amount.MinorUnits > maxSafeInteger {
		return fmt.Errorf("minorUnits exceeds the JavaScript safe integer range")
	}
	if !currencyCode.MatchString(amount.Currency) {
		return fmt.Errorf("currency must be a three-letter uppercase code")
	}
	return nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("egress: payload contains multiple JSON values")
		}
		return fmt.Errorf("egress: invalid trailing data: %w", err)
	}
	return nil
}

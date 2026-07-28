package egress

import (
	"encoding/json"
	"testing"
)

const validRedactedPayload = `{
  "periodTotalsPerCategory":{"food":{"minorUnits":12000,"currency":"XOF"}},
  "totalIncome":{"minorUnits":100000,"currency":"XOF"},
  "totalExpenses":{"minorUnits":12000,"currency":"XOF"},
  "netCashFlow":{"minorUnits":88000,"currency":"XOF"},
  "budgetStatusPercent":{"food":42},
  "goalProgressPercent":{"emergency":15},
  "trendDirection":{"food":"up"}
}`

func TestValidateRedactedAcceptsAggregateSchema(t *testing.T) {
	if err := NewValidator().Validate(json.RawMessage(validRedactedPayload)); err != nil {
		t.Fatalf("valid payload rejected: %v", err)
	}
}

func TestValidateRedactedRejectsNestedRawFields(t *testing.T) {
	payload := `{
  "periodTotalsPerCategory":{"food":{"minorUnits":12000,"currency":"XOF","transactions":[{"note":"secret"}]}},
  "totalIncome":{"minorUnits":100000,"currency":"XOF"},
  "totalExpenses":{"minorUnits":12000,"currency":"XOF"},
  "netCashFlow":{"minorUnits":88000,"currency":"XOF"},
  "budgetStatusPercent":{},"goalProgressPercent":{},"trendDirection":{}
}`
	if err := NewValidator().Validate(json.RawMessage(payload)); err == nil {
		t.Fatal("nested full-egress fields were accepted")
	}
}

func TestValidateRedactedRejectsUnknownOrMissingFields(t *testing.T) {
	tests := []string{
		`{"transactions":[]}`,
		`{"periodTotalsPerCategory":{},"totalIncome":{"minorUnits":0,"currency":"XOF"},"totalExpenses":{"minorUnits":0,"currency":"XOF"},"netCashFlow":{"minorUnits":0,"currency":"XOF"},"budgetStatusPercent":{},"goalProgressPercent":{},"trendDirection":{},"note":"secret"}`,
	}
	for _, payload := range tests {
		if err := NewValidator().Validate(json.RawMessage(payload)); err == nil {
			t.Fatalf("invalid payload accepted: %s", payload)
		}
	}
}

func TestValidateRedactedRejectsInvalidAggregateValues(t *testing.T) {
	payload := `{
  "periodTotalsPerCategory":{},
  "totalIncome":{"minorUnits":0,"currency":"xof"},
  "totalExpenses":{"minorUnits":0,"currency":"XOF"},
  "netCashFlow":{"minorUnits":0,"currency":"XOF"},
  "budgetStatusPercent":{"food":-1},
  "goalProgressPercent":{},"trendDirection":{"food":"sideways"}
}`
	if err := NewValidator().Validate(json.RawMessage(payload)); err == nil {
		t.Fatal("invalid aggregate values were accepted")
	}
}

func TestValidateRedactedRejectsNullMapsAndUnsafeIntegers(t *testing.T) {
	tests := []string{
		`{"periodTotalsPerCategory":null,"totalIncome":{"minorUnits":0,"currency":"XOF"},"totalExpenses":{"minorUnits":0,"currency":"XOF"},"netCashFlow":{"minorUnits":0,"currency":"XOF"},"budgetStatusPercent":{},"goalProgressPercent":{},"trendDirection":{}}`,
		`{"periodTotalsPerCategory":{},"totalIncome":{"minorUnits":9007199254740992,"currency":"XOF"},"totalExpenses":{"minorUnits":0,"currency":"XOF"},"netCashFlow":{"minorUnits":0,"currency":"XOF"},"budgetStatusPercent":{},"goalProgressPercent":{},"trendDirection":{}}`,
	}
	for _, payload := range tests {
		if err := NewValidator().Validate(json.RawMessage(payload)); err == nil {
			t.Fatalf("invalid payload accepted: %s", payload)
		}
	}
}

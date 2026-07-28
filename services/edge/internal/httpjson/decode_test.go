package httpjson

import (
	"strings"
	"testing"
)

func TestDecodeObjectAcceptsOneExactObject(t *testing.T) {
	var body struct {
		Name string `json:"name"`
	}
	if err := DecodeObject(strings.NewReader(`{"name":"WiseMoney"}`), &body); err != nil {
		t.Fatalf("valid object rejected: %v", err)
	}
	if body.Name != "WiseMoney" {
		t.Fatalf("unexpected decoded name %q", body.Name)
	}
}

func TestDecodeObjectRejectsUnknownFieldsAndTrailingValues(t *testing.T) {
	for _, input := range []string{
		`{"name":"WiseMoney","secret":true}`,
		`{"name":"WiseMoney"} {"name":"second"}`,
	} {
		var body struct {
			Name string `json:"name"`
		}
		if err := DecodeObject(strings.NewReader(input), &body); err == nil {
			t.Fatalf("invalid body accepted: %s", input)
		}
	}
}

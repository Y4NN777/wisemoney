package httpjson

import (
	"encoding/json"
	"fmt"
	"io"
)

// DecodeObject decodes exactly one JSON object and rejects unknown fields.
func DecodeObject(body io.Reader, destination any) error {
	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}

	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("request body contains multiple JSON values")
		}
		return fmt.Errorf("request body contains invalid trailing data: %w", err)
	}
	return nil
}

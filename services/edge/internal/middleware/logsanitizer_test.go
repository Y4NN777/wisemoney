package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResponseRecorderKeepsFirstStatus(t *testing.T) {
	response := httptest.NewRecorder()
	recorder := &responseRecorder{ResponseWriter: response, status: http.StatusOK}
	recorder.WriteHeader(http.StatusCreated)
	recorder.WriteHeader(http.StatusInternalServerError)

	if recorder.status != http.StatusCreated || response.Code != http.StatusCreated {
		t.Fatalf("status changed after first header: recorder=%d response=%d", recorder.status, response.Code)
	}
}

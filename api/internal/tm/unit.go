package tm

import "time"

// Unit is the JSON wire format for one TM row (camelCase for the SPA).
type Unit struct {
	ID            string  `json:"id"`
	Source        string  `json:"source"`
	Target        string  `json:"target"`
	SourceKey     string  `json:"sourceKey"`
	SourceLang    *string `json:"sourceLang,omitempty"`
	TargetLang    *string `json:"targetLang,omitempty"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
	DeletedAt     *string `json:"deletedAt,omitempty"`
	ProjectID     *string `json:"projectId,omitempty"`
	CreatedBy     *string `json:"createdBy,omitempty"`
	UpdatedBy     *string `json:"updatedBy,omitempty"`
	ContextBefore *string `json:"contextBefore,omitempty"`
	ContextAfter  *string `json:"contextAfter,omitempty"`
}

type PullResponse struct {
	Until   string `json:"until"`
	Units   []Unit `json:"units"`
	HasMore bool   `json:"hasMore"`
}

type PushRequest struct {
	Units []Unit `json:"units"`
}

type PushResponse struct {
	OK    bool   `json:"ok"`
	Until string `json:"until"`
}

const pageSize = 500

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

func parseTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339, s)
}

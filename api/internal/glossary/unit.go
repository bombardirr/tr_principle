package glossary

import "time"

type Term struct {
	ID            string  `json:"id"`
	SourceLang    string  `json:"sourceLang"`
	TargetLang    string  `json:"targetLang"`
	SourceTerm    string  `json:"sourceTerm"`
	TargetTerm    string  `json:"targetTerm"`
	Status        string  `json:"status"`
	Note          *string `json:"note,omitempty"`
	CaseSensitive bool    `json:"caseSensitive"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
	DeletedAt     *string `json:"deletedAt,omitempty"`
	CreatedBy     *string `json:"createdBy,omitempty"`
}

type PullResponse struct {
	Until   string `json:"until"`
	Terms   []Term `json:"terms"`
	HasMore bool   `json:"hasMore"`
}

type PushRequest struct {
	Terms []Term `json:"terms"`
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

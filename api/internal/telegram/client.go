package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	token      string
	httpClient *http.Client
}

func NewClient(token string) *Client {
	return &Client{
		token: token,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) Enabled() bool {
	return c != nil && c.token != ""
}

type apiResponse struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

func (c *Client) call(ctx context.Context, method string, payload any) error {
	if !c.Enabled() {
		return fmt.Errorf("telegram bot not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	url := "https://api.telegram.org/bot" + c.token + "/" + method
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var parsed apiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return fmt.Errorf("telegram %s: status %d", method, res.StatusCode)
	}
	if !parsed.OK {
		if parsed.Description != "" {
			return fmt.Errorf("telegram %s: %s", method, parsed.Description)
		}
		return fmt.Errorf("telegram %s failed", method)
	}
	return nil
}

func (c *Client) SendMessage(ctx context.Context, chatID int64, text string) error {
	return c.call(ctx, "sendMessage", map[string]any{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	})
}

func (c *Client) SetWebhook(ctx context.Context, webhookURL, secretToken string) error {
	payload := map[string]any{
		"url":                  webhookURL,
		"secret_token":         secretToken,
		"drop_pending_updates": true,
		"allowed_updates":      []string{"message"},
	}
	return c.call(ctx, "setWebhook", payload)
}

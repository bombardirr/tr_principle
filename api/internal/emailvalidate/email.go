package emailvalidate

import (
	"errors"
	"net/mail"
	"strings"
	"unicode/utf8"
)

var ErrInvalid = errors.New("invalid email")

const maxEmailBytes = 254

// NormalizeAndValidate — как в disput/peerling: trim, lowercase, RFC parse, домен с точкой.
func NormalizeAndValidate(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxEmailBytes || utf8.RuneCountInString(raw) > maxEmailBytes {
		return "", ErrInvalid
	}
	addr, err := mail.ParseAddress(raw)
	if err != nil {
		return "", ErrInvalid
	}
	at := strings.LastIndex(addr.Address, "@")
	if at < 1 || at == len(addr.Address)-1 {
		return "", ErrInvalid
	}
	local, domain := addr.Address[:at], addr.Address[at+1:]
	if len(local) > 64 || len(domain) > 253 {
		return "", ErrInvalid
	}
	if strings.Contains(domain, "..") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") {
		return "", ErrInvalid
	}
	if !strings.Contains(domain, ".") {
		return "", ErrInvalid
	}
	return strings.ToLower(addr.Address), nil
}

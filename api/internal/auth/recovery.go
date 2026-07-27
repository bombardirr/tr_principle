package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
)

const recoveryCodeParts = 4
const recoveryCodePartBytes = 2 // 4 hex chars per part

// GenerateRecoveryCode returns a high-entropy code like AB12-CD34-EF56-7890.
func GenerateRecoveryCode() (string, error) {
	parts := make([]string, recoveryCodeParts)
	for i := 0; i < recoveryCodeParts; i++ {
		var b [recoveryCodePartBytes]byte
		if _, err := rand.Read(b[:]); err != nil {
			return "", err
		}
		parts[i] = strings.ToUpper(hex.EncodeToString(b[:]))
	}
	return strings.Join(parts, "-"), nil
}

func NormalizeRecoveryCode(raw string) string {
	s := strings.ToUpper(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, " ", "")
	return s
}

func HashRecoveryCode(raw string) string {
	return HashLicenseKey(NormalizeRecoveryCode(raw))
}

func ValidateRecoveryCodeFormat(raw string) error {
	n := NormalizeRecoveryCode(raw)
	parts := strings.Split(n, "-")
	if len(parts) != recoveryCodeParts {
		return fmt.Errorf("%w: invalid recovery code", ErrValidation)
	}
	for _, p := range parts {
		if len(p) != recoveryCodePartBytes*2 {
			return fmt.Errorf("%w: invalid recovery code", ErrValidation)
		}
		for _, c := range p {
			if (c < '0' || c > '9') && (c < 'A' || c > 'F') {
				return fmt.Errorf("%w: invalid recovery code", ErrValidation)
			}
		}
	}
	return nil
}

package auth

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/bombardirr/tr_principle/api/internal/emailvalidate"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrEmailTaken         = errors.New("email taken")
	ErrValidation         = errors.New("validation failed")
	ErrUnauthorized       = errors.New("unauthorized")
)

type Claims struct {
	Email string `json:"email"`
	SV    int    `json:"sv"`
	jwt.RegisteredClaims
}

type TokenIssuer struct {
	secret []byte
	ttl    time.Duration
}

func NewTokenIssuer(secret []byte, ttl time.Duration) *TokenIssuer {
	return &TokenIssuer{secret: secret, ttl: ttl}
}

func (t *TokenIssuer) Issue(userID uuid.UUID, email string, sv int) (string, error) {
	now := time.Now()
	claims := Claims{
		Email: email,
		SV:    sv,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(t.ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(t.secret)
}

func (t *TokenIssuer) Parse(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return t.secret, nil
	})
	if err != nil {
		return nil, ErrUnauthorized
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrUnauthorized
	}
	return claims, nil
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func ValidateCredentials(email, password string) (string, error) {
	normalized, err := emailvalidate.NormalizeAndValidate(email)
	if err != nil {
		return "", fmt.Errorf("%w: invalid email", ErrValidation)
	}
	if utf8.RuneCountInString(password) < 8 {
		return "", fmt.Errorf("%w: password must be at least 8 characters", ErrValidation)
	}
	return normalized, nil
}

const maxDisplayNameRunes = 80

func NormalizeDisplayName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	name = strings.ReplaceAll(name, "\n", " ")
	name = strings.ReplaceAll(name, "\r", " ")
	for strings.Contains(name, "  ") {
		name = strings.ReplaceAll(name, "  ", " ")
	}
	if utf8.RuneCountInString(name) > maxDisplayNameRunes {
		return "", fmt.Errorf("%w: display name too long", ErrValidation)
	}
	return name, nil
}

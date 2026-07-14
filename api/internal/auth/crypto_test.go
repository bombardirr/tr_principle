package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestValidateCredentials(t *testing.T) {
	if _, err := ValidateCredentials("ab", "password1"); err == nil {
		t.Fatal("expected bad email to fail")
	}
	if _, err := ValidateCredentials("joe@yandex.ru", "short"); err == nil {
		t.Fatal("expected short password to fail")
	}
	email, err := ValidateCredentials("Joe.Falange@Yandex.ru", "password1")
	if err != nil {
		t.Fatalf("valid email: %v", err)
	}
	if email != "joe.falange@yandex.ru" {
		t.Fatalf("normalize: %q", email)
	}
}

func TestPasswordHashRoundtrip(t *testing.T) {
	hash, err := HashPassword("password1")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, "password1") {
		t.Fatal("hash mismatch")
	}
	if CheckPassword(hash, "password2") {
		t.Fatal("wrong password accepted")
	}
}

func TestTokenRoundtrip(t *testing.T) {
	issuer := NewTokenIssuer([]byte("test-secret-key-32bytes-minimum!!"), time.Hour)
	id := uuid.New()
	token, err := issuer.Issue(id, "alice@example.com", 3)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := issuer.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != id.String() || claims.Email != "alice@example.com" || claims.SV != 3 {
		t.Fatalf("claims=%+v", claims)
	}
}

package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestValidateCredentials(t *testing.T) {
	if err := ValidateCredentials("ab", "password1"); err == nil {
		t.Fatal("expected short login to fail")
	}
	if err := ValidateCredentials("user_ok", "short"); err == nil {
		t.Fatal("expected short password to fail")
	}
	if err := ValidateCredentials("user_ok", "password1"); err != nil {
		t.Fatalf("valid creds: %v", err)
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
	token, err := issuer.Issue(id, "alice", 3)
	if err != nil {
		t.Fatal(err)
	}
	claims, err := issuer.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != id.String() || claims.Login != "alice" || claims.SV != 3 {
		t.Fatalf("claims=%+v", claims)
	}
}

package auth

import "testing"

func TestNormalizeRecoveryCode(t *testing.T) {
	got := NormalizeRecoveryCode(" ab12-cd34-ef56-7890 ")
	if got != "AB12-CD34-EF56-7890" {
		t.Fatalf("got %q", got)
	}
}

func TestValidateRecoveryCodeFormat(t *testing.T) {
	if err := ValidateRecoveryCodeFormat("AB12-CD34-EF56-7890"); err != nil {
		t.Fatal(err)
	}
	if err := ValidateRecoveryCodeFormat("short"); err == nil {
		t.Fatal("expected error")
	}
}

func TestGenerateRecoveryCode(t *testing.T) {
	code, err := GenerateRecoveryCode()
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateRecoveryCodeFormat(code); err != nil {
		t.Fatalf("%q: %v", code, err)
	}
}

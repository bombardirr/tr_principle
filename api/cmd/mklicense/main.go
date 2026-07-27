// Command mklicense prints a random Pro license key and SQL to insert its hash.
// Prefer the in-app admin UI (Settings → License keys) when the API is running.
//
//	go run ./cmd/mklicense -sku pro_1m
//	go run ./cmd/mklicense -sku pro_12m -note "ivan@example.com"
package main

import (
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/bombardirr/tr_principle/api/internal/auth"
)

func main() {
	sku := flag.String("sku", "pro_1m", "pro_1m | pro_3m | pro_6m | pro_12m")
	note := flag.String("note", "", "optional admin note (buyer email, order id)")
	flag.Parse()
	days, ok := auth.LicenseSKUDays(*sku)
	if !ok {
		fmt.Fprintf(os.Stderr, "unknown sku %q\n", *sku)
		os.Exit(1)
	}
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	key := "AZ-" + hex.EncodeToString(raw[:])
	hash := auth.HashLicenseKey(key)
	hint := key[:7] + "…" + key[len(key)-4:]
	n := strings.ReplaceAll(*note, "'", "''")
	fmt.Printf("key:  %s\n", key)
	fmt.Printf("hint: %s\n", hint)
	fmt.Printf("hash: %s\n", hash)
	fmt.Printf(
		"SQL:\nINSERT INTO license_keys (key_hash, key_hint, sku, duration_days, status, note)\nVALUES ('%s', '%s', '%s', %d, 'unused', '%s');\n",
		hash, hint, *sku, days, n,
	)
	fmt.Println("Send the key line to the buyer once. Do not store plaintext after delivery.")
}

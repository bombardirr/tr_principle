package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// MountSPA serves Vite dist (index.html + /assets) for non-API routes — same idea as disput/peerling.
func MountSPA(api http.Handler, publicDir string) http.Handler {
	publicDir = filepath.Clean(publicDir)
	indexPath := filepath.Join(publicDir, "index.html")
	if st, err := os.Stat(indexPath); err != nil || st.IsDir() {
		return api
	}
	assetsDir := filepath.Join(publicDir, "assets")
	var assets http.Handler
	if fi, err := os.Stat(assetsDir); err == nil && fi.IsDir() {
		assets = http.StripPrefix("/assets/", http.FileServer(http.Dir(assetsDir)))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if p == "" {
			p = "/"
		}
		if strings.HasPrefix(p, "/api/") || p == "/api" || p == "/metrics" {
			api.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			api.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(p, "/assets/") && assets != nil {
			assets.ServeHTTP(w, r)
			return
		}
		if p != "/" && servePublicFile(w, r, publicDir, p) {
			return
		}
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		http.ServeFile(w, r, indexPath)
	})
}

func servePublicFile(w http.ResponseWriter, r *http.Request, publicDir, urlPath string) bool {
	rel := strings.TrimPrefix(urlPath, "/")
	if rel == "" || strings.Contains(rel, "..") {
		return false
	}
	full := filepath.Clean(filepath.Join(publicDir, rel))
	pubAbs, err := filepath.Abs(publicDir)
	if err != nil {
		return false
	}
	fileAbs, err := filepath.Abs(full)
	if err != nil {
		return false
	}
	sep := string(os.PathSeparator)
	if fileAbs != pubAbs && !strings.HasPrefix(fileAbs, pubAbs+sep) {
		return false
	}
	st, err := os.Stat(fileAbs)
	if err != nil || st.IsDir() {
		return false
	}
	http.ServeFile(w, r, fileAbs)
	return true
}

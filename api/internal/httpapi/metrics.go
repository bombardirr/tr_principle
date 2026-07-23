package httpapi

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	uuidSegment = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

	httpRequests = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total HTTP requests processed.",
		},
		[]string{"method", "path_group", "code"},
	)
	httpDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path_group"},
	)
)

func init() {
	mustRegisterOrReuse(httpRequests)
	mustRegisterOrReuse(httpDuration)
	mustRegisterOrReuse(collectors.NewGoCollector())
	mustRegisterOrReuse(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
}

func mustRegisterOrReuse(c prometheus.Collector) {
	if err := prometheus.Register(c); err != nil {
		if _, ok := err.(prometheus.AlreadyRegisteredError); ok {
			return
		}
		panic(err)
	}
}

// PathGroup maps a request path to a low-cardinality label (UUIDs → *).
func PathGroup(path string) string {
	if path == "" {
		return "/"
	}
	parts := strings.Split(path, "/")
	for i, p := range parts {
		if p == "" {
			continue
		}
		if uuidSegment.MatchString(p) {
			parts[i] = "*"
		}
	}
	out := strings.Join(parts, "/")
	if out == "" {
		return "/"
	}
	return out
}

// Instrument records request count and duration with grouped paths.
func Instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(ww, r)
		group := PathGroup(r.URL.Path)
		code := strconv.Itoa(ww.status)
		httpRequests.WithLabelValues(r.Method, group, code).Inc()
		httpDuration.WithLabelValues(r.Method, group).Observe(time.Since(start).Seconds())
	})
}

// MetricsHandler serves the default Prometheus registry.
func MetricsHandler() http.Handler {
	return promhttp.Handler()
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

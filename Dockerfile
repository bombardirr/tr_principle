# Single prod image: Vue SPA + Go app (API + static), like disput / peerling.
# NPM → this container :8080 (no nested nginx).

FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_GRAFANA_URL=https://metrics.appzac.ru
ENV VITE_GRAFANA_URL=$VITE_GRAFANA_URL
RUN npm run build

FROM golang:1.26-alpine AS backend
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget tzdata
WORKDIR /app
COPY --from=backend /out/server /app/server
COPY --from=backend /src/migrations /app/migrations
COPY --from=frontend /app/dist /app/public
ENV HTTP_ADDR=:8080
ENV MIGRATIONS_DIR=/app/migrations
ENV PUBLIC_DIR=/app/public
EXPOSE 8080
CMD ["/app/server"]

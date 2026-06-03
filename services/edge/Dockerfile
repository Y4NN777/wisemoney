# WiseMoney — managed edge Dockerfile
# Multi-stage build: static Go binary → distroless runtime.
# No :latest tags anywhere (MISHKAN standard, harness primitive).
# Pinned image digests should be verified and updated via /dep-audit.

# ---------------------------------------------------------------------------
# Stage 1: builder
# ---------------------------------------------------------------------------
FROM golang:1.23-bookworm AS builder

WORKDIR /src

# Copy dependency manifests first to leverage layer caching.
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build a fully static binary (CGO_ENABLED=0).
# GOARCH/GOOS default to the builder platform; override at build-arg if needed.
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /edge \
    ./cmd/edge

# ---------------------------------------------------------------------------
# Stage 2: runtime (distroless — minimal attack surface, M-PROXY-02)
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot

# nonroot tag runs as uid=65532 (nonroot user) — no root inside the container.
# EXPOSE declares the port; actual binding is via docker-compose env (EDGE_PORT).
EXPOSE 8080

COPY --from=builder /edge /edge

ENTRYPOINT ["/edge"]

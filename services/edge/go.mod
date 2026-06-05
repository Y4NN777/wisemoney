module github.com/y4nn/wisemoney/services/edge

go 1.25.0

toolchain go1.25.11 // pin build toolchain ≥1.25.11: clears all stdlib advisories (GO-2026-49xx/50xx)

require (
	github.com/go-chi/chi/v5 v5.2.4 // GO-2025-3770 (open redirect) + GO-2026-4316
	github.com/golang-jwt/jwt/v5 v5.2.2
	github.com/jackc/pgx/v5 v5.9.2 // CVE-2026-33816 (GO-2026-4772, CVSS 9.8): memory-safety in pgx driver
	golang.org/x/crypto v0.52.0 // GO-2025-4134/-4135: backs argon2 password hashing (FR-AUTH)
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.45.0 // indirect
	golang.org/x/text v0.37.0 // indirect
)

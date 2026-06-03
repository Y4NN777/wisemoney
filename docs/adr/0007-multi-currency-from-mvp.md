# ADR-0007: Multi-currency from MVP (integer minor units + ISO-4217; cached user-editable FX)

| Field   | Value                                                       |
| ------- | ----------------------------------------------------------- |
| Status  | Accepted                                                    |
| Date    | 2026-06-02                                                  |
| Source  | Intake Gate-3 decision 14                                  |
| Binds   | INV-MON-01..05; ARCHITECTURE §5, §6                        |

## Context

A decision was required on whether the MVP supports multiple currencies and, if so,
how money is represented and how cross-currency aggregation works without breaking
the offline-first guarantee.

## Decision

**Multi-currency from the MVP.** The money invariant: every monetary amount is
**(integer minor units, ISO-4217 currency code)**; floating-point types are
prohibited for money at every storage or transmission boundary (INV-MON-01).

- Each **Account** has exactly one currency, fixed at creation and immutable
  thereafter — with **no zero-event exception** (INV-MON-02, resolved in
  ARCHITECTURE §6). A Transaction is denominated in its Account's currency.
- Aggregated/display values spanning currencies are derived by converting into a
  user-chosen **BASE** currency using **locally-cached, user-editable FX rates**
  (INV-MON-03). Conversion **never** requires a live network call; offline and online
  produce identical derived totals given identical cached rates.
- Online refresh is **optional and best-effort** — it writes new values into the
  cached table but is never a dependency of a conversion (ARCHITECTURE §5). Rates are
  user-editable; manual-only is a valid steady state.
- Conversion is display/derivation only — stored source amounts are never mutated
  (INV-MON-04). Rounding is **half-even (banker's rounding)** to the target
  currency's minor unit, applied uniformly (INV-MON-05).

## Consequences

- The offline-first guarantee (INV-PERS-01) is preserved: no conversion code path
  awaits a network response.
- The FX-rate **sourcing mechanism** behind the refresh adapter is a swappable,
  deferred build-time detail (ARCHITECTURE AQ-03); the architecture binds only that
  refresh is best-effort and decoupled from conversion.
- Account currency immutability removes a stateful special case across every
  currency-touching code path; "wrong currency" is served by deleting the empty
  account and creating a new one (ARCHITECTURE §6).
- Staleness of cached rates is surfaced to the user (informational, never blocking).

## Alternatives considered

- **Single-currency MVP.** Not selected — Gate-3 decision 14 chose multi-currency
  from the start; retrofitting currency onto a single-currency money model later is a
  costly, error-prone change to the core representation.
- **Strictly-online FX rates.** Rejected — a hard online dependency for conversion
  would break offline-first; the default stands unless Y4NN later picks strictly-online.
- **Strictly-manual FX rates.** Available as a valid steady state (rates are
  user-editable) but not imposed; optional online refresh is offered on top.
- **Floating-point money.** Rejected — non-associative arithmetic and rounding error
  compound across aggregations (INV-MON-01).

# Hybrid Log Classifier

A resilient, multi-tiered log classification system combining deterministic regex matching, sentence embedding-based machine learning (BERT + Logistic Regression), and large language model (LLM) fallback reasoning.

The system is designed to provide high-throughput, low-latency classification for standard application and infrastructure logs while retaining deep semantic reasoning for novel, ambiguous, or complex failure patterns.

---

## What's Production-Hardened Here vs. Tutorials

| Concern | Reference Tutorial | This Project |
|---|---|---|
| Batch Processing | Single shared `resources/output.csv` on disk - concurrent requests overwrite each other | Streamed per-request response, never touching shared disk files |
| Authentication | None | API key header verification (`X-API-Key`), required and strictly enforced in production |
| Rate Limiting | None | Per-IP rate limiting, with stricter bounds on bulk/batch operations |
| LLM Resilience | Bare call with no retry mechanism | Exponential backoff retries on transient network/provider errors, fail-fast on client errors |
| Logging | `print()` / unformatted console logs | Structured JSON logging with request ID correlation on every log entry |
| Observability | None | Prometheus metrics: request counts, latency histograms, active connections |
| Error Handling | Bare `except Exception` swallowing errors | Global exception handlers with sanitized client errors (no internal stack leak) |
| Test Coverage | None | Comprehensive unit, integration, and end-to-end test suites |
| CI/CD | None | Continuous integration workflows for automated test suites and container builds |
| Containers | None | Non-root users, healthcheck probes, and multi-stage builds |
| Retraining Loop | None | Feedback loop persisting predictions and human corrections for continuous model retraining |

---

## Hybrid Classification Architecture

The classification pipeline processes incoming logs through three distinct layers to optimize cost, latency, and accuracy:

1. **Layer 1: Deterministic Pattern Matcher (Regex)**
   * First line of defense for high-frequency, well-known log formats (e.g., standard login failures, memory thresholds).
   * Executes in sub-millisecond time with minimal CPU overhead.

2. **Layer 2: Classical Machine Learning (BERT / TF-IDF + Logistic Regression)**
   * Handles logs that vary too much for rigid regex rules but have sufficient labeled historical examples.
   * Utilizes sentence embeddings (`all-MiniLM-L6-v2`) with a Logistic Regression classification head to generate calibrated probability scores.
   * Gracefully degrades to a TF-IDF vectorizer if neural embedding models are unavailable or constrained.
   * If the model's prediction confidence falls below the confidence threshold, the log automatically escalates to Layer 3.

3. **Layer 3: Generative AI Reasoning (LLM Fallback)**
   * Engaged for rare, anomalous, or ambiguous logs where ML confidence is low.
   * Leverages an LLM via Groq with structured JSON outputs and retry logic.
   * Logs that fail even the LLM confidence threshold are automatically flagged for human review.

4. **Source-Based Fast-Path Overrides**
   * Configurable upstream sources known to produce noisy or unstructured data (e.g., legacy systems) can bypass regex and ML layers entirely and route directly to the LLM.

---

## Continuous Retraining Loop

* Every classification decision and manual correction is persisted to the database.
* Human corrections serve as ground truth labels.
* Labeled records are queried to periodically retrain the classical ML model and update registered model artifacts without service disruption.

---

## Authentication & Identity Architecture

* **Multi-Scheme Authentication**: Supports JWT Bearer tokens with cryptographically secure rotatable refresh tokens and replay protection, granular personal API keys, and OAuth2 authorization-code flows.
* **Role-Based Access Control (RBAC)**: Enforces distinct access tiers separating standard user classification operations from administrative control plane endpoints.
* **OAuth2 Social Login & Account Linking**: Integrates Google and GitHub social authentication with an explicit account-linking policy:
  * Existing email+password users logging in with verified provider emails are linked automatically without creating duplicate user records.
  * Existing hashed passwords and assigned roles remain intact, allowing continued access via both password and social logins.
  * New social login users are initialized with verified email status and no password requirement.

---

## Product Hardening, Billing & Compliance

* **Email Verification & Self-Service Password Recovery**: Secure tokenized verification and recovery workflows with automatic session revocation on credential resets.
* **Tiered Subscriptions & Stripe Billing**: Tiered rate limits and daily classification quotas (Community Free, Professional, Enterprise) backed by Stripe webhooks and server-side quota reconciliation.
* **Contextual Notifications**: Automated in-app delivery for completed batch operations and proactive daily quota threshold alerts.
* **GDPR Compliance**: Full support for European Union data privacy requirements, including structured personal data portability and irreversible right-to-erasure account purging.
* **Granular Observability**: Metrics broken down by user role and subscription tier, complemented by Grafana dashboard templates for infrastructure visibility.

---

## Production Deployment Considerations

* **Environment & Security**: Set `ENVIRONMENT=production` and configure `API_KEYS` to enforce authentication across all operational endpoints.
* **Database**: Dedicated PostgreSQL instance managing unified transactional state, relational integrity, and server-side sessions.
* **Source Routing**: Populate `LLM_ONLY_SOURCES` for systems lacking structured formats.
* **Monitoring & Alerts**: Ingest Prometheus metrics to monitor classification layer distribution; an unexpected spike in LLM fallback indicates regex/ML drift.
* **Network & TLS**: Place behind a reverse proxy or API gateway (such as Nginx, Cloudflare, or AWS ALB) for TLS termination.

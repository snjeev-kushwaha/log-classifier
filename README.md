# Hybrid Log Classifier

A resilient, multi-tiered enterprise log classification platform combining deterministic regex pattern matching, sentence embedding-based machine learning (BERT + Logistic Regression), and large language model (LLM) fallback reasoning.

Designed to provide high-throughput, sub-millisecond classification for standard infrastructure logs while retaining deep semantic reasoning for novel, ambiguous, or complex failure patterns.

---

## Architecture Overview

```
               Incoming Log Line
                       │
                       ▼
       ┌───────────────────────────────┐
       │   Layer 1: Regex Matcher      │ ──► [Match] ──► Sub-millisecond Result
       └───────────────────────────────┘
                       │ (No Match)
                       ▼
       ┌───────────────────────────────┐
       │   Layer 2: BERT / ML Model    │ ──► [Confidence ≥ 0.75] ──► Calibrated Label
       └───────────────────────────────┘
                       │ (Low Confidence)
                       ▼
       ┌───────────────────────────────┐
       │   Layer 3: Groq LLM Fallback  │ ──► [Confidence ≥ 0.60] ──► Structured Reasoned Result
       └───────────────────────────────┘
                       │ (Uncertain)
                       ▼
       ┌───────────────────────────────┐
       │      Human Review Queue       │ ──► Feedback Retraining Loop
       └───────────────────────────────┘
```

1. **Layer 1: Deterministic Pattern Matcher (Regex)**
   * First line of defense for high-frequency, well-known log formats (e.g., authentication brute force, memory spikes).
   * Executes in sub-millisecond latency with minimal CPU overhead.
2. **Layer 2: Classical Machine Learning (BERT / Sentence Transformers + Logistic Regression)**
   * Uses `all-MiniLM-L6-v2` sentence embeddings with calibrated probability scores.
   * If confidence drops below `ML_CONFIDENCE_THRESHOLD` (default: 0.75), automatically escalates to Layer 3.
3. **Layer 3: Generative AI Reasoning (Groq LLM Fallback)**
   * Engaged for rare, novel, or ambiguous log patterns.
   * Leverages high-speed LLMs via Groq (e.g., `qwen/qwen3.8-27b` or `openai/gpt-oss-120b`) with structured JSON outputs.
   * Logs below `LLM_FALLBACK_CONFIDENCE_THRESHOLD` (default: 0.60) are queued for human review.
4. **Continuous Retraining Loop**
   * Persists inference telemetry and human feedback to database records for incremental model retraining.

---

## Necessary API Keys & Environment Configuration

Copy the example environment file in the `backend/` directory:

```bash
cd backend
cp .env.example .env
```

### 1. Required Keys (Core System)

| Variable | Description | Default / Example | Where to Get |
|---|---|---|---|
| `GROQ_API_KEY` | **Required** for Layer 3 LLM fallback classification and reasoning. *(If omitted, Layers 1 & 2 still run, but LLM fallback will be unavailable)* | `gsk_...` | Free API key from [Groq Console](https://console.groq.com/) |
| `JWT_SECRET_KEY` | **Required** for signing access tokens and session security. | `dev-jwt-secret-key-...` | Generate with `openssl rand -hex 32` |
| `DATABASE_URL` | Database connection URI. Defaults to local SQLite file for zero-config local development. | `sqlite:///./log_classifier.db` | PostgreSQL in production: `postgresql+psycopg://user:pass@localhost:5432/db` |

### 2. Optional Keys (Integrations & Production)

| Category | Variable | Purpose |
|---|---|---|
| **Social Login (OAuth2)** | `GOOGLE_CLIENT_ID`<br>`GOOGLE_CLIENT_SECRET` | Google Sign-In via Google Cloud Console credentials. |
| | `GITHUB_CLIENT_ID`<br>`GITHUB_CLIENT_SECRET` | GitHub Sign-In via GitHub Developer OAuth Apps. |
| | `OAUTH_REDIRECT_BASE_URL` | Base URL for OAuth callbacks (default: `http://localhost:8000`). |
| **Stripe Billing** | `STRIPE_SECRET_KEY`<br>`STRIPE_WEBHOOK_SECRET` | Enables tier checkout sessions and quota webhooks. |
| **Email Service (SMTP)** | `SMTP_HOST`<br>`SMTP_PORT`<br>`SMTP_USER`<br>`SMTP_PASSWORD` | Email verification & password recovery tokens. |
| **Static API Keys** | `API_KEYS` | Comma-separated keys for machine-to-machine header verification (`X-API-Key`). |
| **Routing Overrides** | `LLM_ONLY_SOURCES` | Comma-separated `source` names that skip regex/ML and go directly to LLM. |

---

## Quick Start: Running Backend & Frontend

### Prerequisites

* **Python 3.11+** or **3.12+**
* **Node.js 18+** and **npm**
* *(Optional)* Docker & Docker Compose

---

### 1. Run Backend Server (FastAPI)

#### Windows (PowerShell):
```powershell
cd backend

# Option A: Automated PowerShell setup script
.\run.ps1

# Option B: Manual setup
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

#### Windows (Command Prompt / CMD):
```cmd
cd backend
run.bat
```

#### macOS / Linux:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend server will start at:
* **API Server**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
* **Interactive OpenAPI Docs (Swagger)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **ReDoc API Documentation**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
* **Health Check Probe**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)

---

### 2. Run Frontend Server (React + Vite)

In a separate terminal window:

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start Vite local development server
npm run dev
```

The frontend web console will be available at:
* **Web UI**: [http://localhost:5173](http://localhost:5173)

---

### 3. Run with Docker Compose (Single Command)

To run the entire full stack (FastAPI backend + React frontend + PostgreSQL database):

```bash
docker compose up --build
```

Services will be accessible at:
* **Frontend UI**: [http://localhost:5173](http://localhost:5173)
* **Backend API**: [http://localhost:8000](http://localhost:8000)
* **PostgreSQL**: `localhost:5432`

---

## User Modes & Access

1. **Guest Mode (Zero Setup / Instant Preview)**:
   * Click **"Explore Classifier Console as Guest"** on the login screen.
   * Test single-line logs directly with interactive sample chips without creating an account.
   * Easily return to sign-in / registration using the top **"← Back to Login & Sign Up"** button.
2. **Standard User Platform**:
   * Create an account or sign in with email/password or Google/GitHub OAuth.
   * Access classification history, personal API keys, GDPR data exports, and subscription quota status.
3. **Administrator Control Center**:
   * Sign in using the default root credentials (`root` / `RootAdminPassword123!`).
   * Manage users, live system telemetry, custom regex rules engine, audit logs, and infrastructure observability.

---

## Running Test Suites

### Backend Tests (pytest)
```bash
cd backend
.\venv\Scripts\pytest -v
```

### Frontend Tests (Vitest & React Testing Library)
```bash
cd frontend
npm test
```

### Frontend End-to-End Tests (Playwright)
```bash
cd frontend
npm run test:e2e
```

### Production Frontend Build
```bash
cd frontend
npm run build
```

---

## API Usage Examples

### Classify a Single Log Line (`POST /api/v1/classify`)

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/classify" \
  -H "Content-Type: application/json" \
  -d '{"text": "Failed password for root from 192.168.1.105 port 54322 ssh2"}'
```

**Response**:
```json
{
  "text": "Failed password for root from 192.168.1.105 port 54322 ssh2",
  "label": "security_alert",
  "confidence": 1.0,
  "method_used": "regex",
  "needs_human_review": false,
  "reasoning": null
}
```

### Batch Classification (`POST /api/v1/classify/batch`)

Upload a `.csv` file with a `text` column to process high-volume logs:

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/classify/batch" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@server_logs.csv"
```

---

## Production Deployment Checklist

1. **Change Secrets**: Update `JWT_SECRET_KEY` and default `ROOT_USER_PASSWORD`.
2. **Set Production Environment**: Set `ENVIRONMENT=production` to enforce authentication across operational endpoints.
3. **Configure PostgreSQL**: Point `DATABASE_URL` to a high-availability PostgreSQL cluster.
4. **Provision Groq API Key**: Set `GROQ_API_KEY` for LLM triage.
5. **TLS Termination**: Place behind Nginx, Traefik, or AWS ALB with valid SSL/TLS certificates.

# Prismalytics

**Self-hosted, AI-powered Business Intelligence platform built with TypeScript.**

Connect your databases, build interactive dashboards, run ad-hoc queries, and let AI generate reports and translate plain English into SQL — all without sending your data to a third-party SaaS.

---

## Features

### Analytics & Visualization
- SQL editor with autocomplete and query history
- Visual no-code query builder
- 50+ chart types via Apache ECharts (line, bar, pie, scatter, heatmap, funnel, treemap, maps)
- Enterprise data grid with pivot tables and Excel/CSV export (AG Grid)
- Drag-and-drop dashboard builder with filters, cross-filtering, and drill-down
- Auto-refresh dashboards and full-screen presentation mode
- Embeddable dashboards via iframe or JavaScript SDK

### Data Sources
- **SQL:** PostgreSQL, MySQL, MSSQL, Oracle, SQLite
- **NoSQL:** MongoDB, Elasticsearch
- **Files:** CSV, Excel, JSON, Parquet
- **APIs:** REST, GraphQL
- **Cloud:** BigQuery, Snowflake, Amazon Redshift, S3

### AI / LLM Integration
- **Natural language to SQL** — type a question, get a validated query
- **AI report generator** — describe a report, get a multi-section dashboard with narrative text
- **Conversational analytics** — streaming chat panel against your data
- **Chart recommender** — AI suggests the best visualization for your data shape
- **Data summarizer** — auto-generated executive summaries and anomaly highlights
- **BYOK (Bring Your Own Key)** — works with Gemini, Claude, OpenRouter, or self-hosted Ollama/vLLM
- Fully functional without an AI key — all AI features degrade gracefully

### Enterprise
- Multi-tenancy with PostgreSQL Row-Level Security
- Keycloak OIDC/SSO integration with RBAC (admin / editor / viewer)
- Scheduled reports via cron with email (PDF/CSV) and Slack/Teams/webhook delivery
- Threshold-based alerts
- Audit logging for all user actions
- Plugin SDK for custom connectors, chart types, and export formats
- Prometheus metrics, OpenTelemetry tracing, Pino structured logging

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS (TypeScript) |
| Frontend | React 19 + Vite 6 + Ant Design 5 |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + BullMQ |
| Charts | Apache ECharts + AG Grid |
| SSO | Keycloak (OIDC) |
| AI | Gemini / Claude / OpenRouter (BYOK) |
| Monorepo | Turborepo |
| Deploy | Docker |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- Docker and Docker Compose

### 1. Clone the repo

```bash
git clone https://github.com/your-org/prismalytics.git
cd prismalytics
```

### 2. Start infrastructure

```bash
cd docker
docker compose up -d
```

This starts PostgreSQL 16, Redis 7, and Keycloak.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment

```bash
cp apps/api/.env.example apps/api/.env.local
```

Edit `apps/api/.env.local` and set at minimum:

```env
DATABASE_URL=postgresql://prismalytics:prismalytics@localhost:5432/prismalytics
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-to-a-random-secret
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=prismalytics
KEYCLOAK_CLIENT_ID=prismalytics-api
```

### 5. Run in development

```bash
npm run dev
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Swagger docs | http://localhost:3000/api/docs |
| Web app | http://localhost:5173 |
| Keycloak admin | http://localhost:8080 (admin / admin) |

---

## AI Setup (optional)

AI features are disabled until you configure an API key. Once you have one, go to **Settings → AI** in the app and paste it in — no restart needed.

| Provider | Where to get a key |
|---|---|
| Google Gemini (recommended) | [aistudio.google.com](https://aistudio.google.com) |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com) |
| OpenRouter (100+ models) | [openrouter.ai](https://openrouter.ai) |
| Ollama (self-hosted) | Run locally, point to `http://localhost:11434` |

API keys are encrypted at rest (AES-256-GCM) and never logged or sent to the frontend.

---

## Project Structure

```
prismalytics/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # React frontend
├── packages/
│   ├── shared-types/ # TypeScript interfaces shared between FE and BE
│   ├── plugin-sdk/   # Plugin development SDK
│   └── query-builder/# Visual query builder logic
├── docker/           # Docker Compose (dev + prod) and Keycloak config
└── docs/             # Documentation
```

---

## Deployment

### Docker Compose (self-hosted)

```bash
cd docker
docker compose -f docker-compose.prod.yml up -d
```
---

## Contributing

Contributions are welcome. Please open an issue to discuss significant changes before submitting a pull request.

```bash
# Run linting and type checks
npm run lint
npm run type-check

# Run unit tests
npm run test

# Run integration tests (requires Docker)
npm run test:e2e
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.).

---

## License

[MIT](LICENSE)

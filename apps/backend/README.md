# @aso/backend

> Main ASO Backend Application

This is the Express application that wires together all ASO packages.

## Quick Start

```bash
# From monorepo root
npm install
npm run build

# Start backend
cd apps/backend
npm run dev
```

## Architecture

```
apps/backend/
├── src/
│   ├── index.ts           # Application entry & wiring
│   ├── config/            # Environment configuration
│   ├── routes/            # HTTP endpoints
│   ├── middleware/        # Express middleware
│   └── websocket/         # WebSocket handlers
└── package.json
```

## Package Dependencies

| Package | Usage |
|---------|-------|
| `@aso/interfaces` | Type contracts (ILLMClient, etc.) |
| `@aso/intent-engine` | PlannerService, ToolConfigManager |
| `@aso/cortex` | Compiler, Matcher, Runtime |
| `@aso/observability` | Telemetry, metrics, health |

## Environment Variables

```env
# Required
GROQ_API_KEY=your-groq-key
NANGO_SECRET_KEY=your-nango-key
DATABASE_URL=postgres://...
REDIS_URL=redis://localhost:6379

# Optional
PORT=3000
NODE_ENV=development
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws` | WebSocket conversation |
| POST | `/api/interpret` | Interpretive search |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

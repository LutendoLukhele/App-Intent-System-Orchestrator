# Contributing to ASO

Thank you for your interest in contributing to ASO (App-System-Orchestrator)! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)

## Code of Conduct

By participating in this project, you agree to maintain a welcoming, inclusive environment. Be respectful, constructive, and collaborative.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 10+
- Docker & Docker Compose
- Redis (for local development)
- PostgreSQL (for local development)

### Fork & Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/aso.git
cd aso
```

## Development Setup

### 1. Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials
# Required: NANGO_SECRET_KEY, GROQ_API_KEY, DATABASE_URL, REDIS_URL
```

### 3. Start Services

```bash
# Start Redis and Postgres via Docker
docker-compose up -d redis postgres

# Or use the full stack
docker-compose up -d
```

### 4. Build & Run

```bash
# Build all packages
npm run build

# Run in development mode
npm run dev
```

## Project Structure

```
aso/
├── packages/                    # Publishable packages
│   ├── interfaces/              # @aso/interfaces - Shared types
│   ├── intent-engine/           # @aso/intent-engine - Planning
│   ├── cortex/                  # @aso/cortex - Automation
│   └── observability/           # @aso/observability - Monitoring
├── apps/
│   └── backend/                 # Main Express application
├── config/                      # Shared configuration
├── docs/                        # Documentation
└── turbo.json                   # Build orchestration
```

### Package Responsibilities

| Package | Purpose | Key Files |
|---------|---------|-----------|
| `@aso/interfaces` | Type contracts | `ILLMClient`, `IToolProvider`, `IProviderAdapter` |
| `@aso/intent-engine` | Intent → Plan | `PlannerService`, `ToolConfigManager` |
| `@aso/cortex` | Event automation | `Compiler`, `Matcher`, `Runtime` |
| `@aso/observability` | Monitoring | `telemetry`, `metrics`, `health` |

## Making Changes

### Branch Naming

```
feature/short-description    # New features
fix/issue-number-description # Bug fixes
docs/what-changed            # Documentation
refactor/what-changed        # Code refactoring
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(intent-engine): add streaming plan generation
fix(cortex): resolve event deduplication race condition
docs: update API documentation
refactor(interfaces): simplify ILLMClient contract
```

### Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Write/update tests
4. Run lint and tests locally
5. Submit a pull request

## Pull Request Process

### Before Submitting

- [ ] Code builds without errors (`npm run build`)
- [ ] Tests pass (`npm run test`)
- [ ] Linting passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Documentation updated if needed

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Related Issues
Fixes #123
```

### Review Process

1. Automated checks must pass
2. At least one maintainer approval required
3. All conversations resolved
4. Squash and merge preferred

## Coding Standards

### TypeScript

```typescript
// ✅ Use interfaces for contracts
interface IMyService {
  doSomething(): Promise<void>;
}

// ✅ Explicit return types
function calculate(x: number): number {
  return x * 2;
}

// ✅ Descriptive naming
const userConnectionStatus = await getStatus(userId);

// ❌ Avoid any
function process(data: any) { } // Bad

// ✅ Use unknown + type guards
function process(data: unknown) {
  if (isValidData(data)) {
    // data is now typed
  }
}
```

### File Organization

```typescript
// 1. Imports (external, then internal)
import express from 'express';
import { ILLMClient } from '@aso/interfaces';

// 2. Types/Interfaces
interface Config { /* ... */ }

// 3. Constants
const DEFAULT_TIMEOUT = 5000;

// 4. Main export(s)
export class MyService { /* ... */ }

// 5. Helper functions (if not exported)
function helperFn() { /* ... */ }
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Interfaces | `I` prefix | `ILLMClient`, `IToolProvider` |
| Classes | PascalCase + suffix | `PlannerService`, `ToolOrchestrator` |
| Functions | camelCase | `generatePlan`, `fetchEmails` |
| Constants | UPPER_SNAKE | `MAX_RETRIES`, `DEFAULT_MODEL` |
| Files | PascalCase for classes | `PlannerService.ts` |

## Testing

### Running Tests

```bash
# All tests
npm run test

# Specific package
npm run test --filter=@aso/intent-engine

# Watch mode
npm run test -- --watch
```

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PlannerService } from '../PlannerService';

describe('PlannerService', () => {
  it('should generate a plan from intent', async () => {
    // Arrange
    const mockLLM = createMockLLMClient();
    const planner = new PlannerService({ llmClient: mockLLM, /* ... */ });
    
    // Act
    const plan = await planner.generatePlan('Send email to John');
    
    // Assert
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].tool).toBe('send_email');
  });
});
```

### Test Coverage

- Aim for 80%+ coverage on core packages
- Critical paths must have tests
- Mock external services (LLM, providers)

## Questions?

- Open a [Discussion](https://github.com/YOUR_ORG/aso/discussions)
- Check existing [Issues](https://github.com/YOUR_ORG/aso/issues)
- Read the [ASO Philosophy](ASO_PHILOSOPHY.md)

---

Thank you for contributing to ASO! 🚀

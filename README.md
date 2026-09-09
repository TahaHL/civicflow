# CivicFlow

CivicFlow is a full-stack personal administration workspace for managing tasks, schedules, documents, reminders, and household finances in one responsive application.

## Highlights

- Secure account registration, sign-in, sessions, and profile settings
- Personal data isolation so every new account starts with an empty workspace
- Priority-based task management with progress insights
- Interactive calendar with expandable day views and drag-to-schedule time blocks
- Document and expiry-date tracking
- Income, spending, bills, budgets, and account-balance tracking
- Contextual notifications for deadlines, appointments, documents, and bills
- Responsive light, dark, and system themes
- Safe two-step deletion controls throughout the interface

## Technology

- React 19 and React Router
- Vite
- Node.js and Express
- SQLite for local development
- PostgreSQL support for production
- Native Node.js integration tests
- Docker-ready deployment configuration

## Run locally

```bash
npm install
npm run dev
```

The application opens at `http://127.0.0.1:5173`. The API runs on port `3001` by default.

Local development uses SQLite automatically. Copy `.env.example` to `.env` only when you need to customise the ports or configure PostgreSQL.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

## Production

See [DEPLOYMENT.md](DEPLOYMENT.md) for the production environment variables and deployment workflow.

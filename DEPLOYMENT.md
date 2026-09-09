# CivicFlow deployment

## Runtime modes

- Local development uses the built-in SQLite database at `server/data/civicflow.db`.
- Production uses PostgreSQL whenever `DATABASE_URL` is configured.
- In production, Express serves both the compiled React application and `/api` from one origin.

## Required production environment

```text
NODE_ENV=production
PORT=3001
APP_ORIGIN=https://your-domain.example
DATABASE_URL=postgresql://user:password@host:5432/civicflow
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
```

Never commit a real `.env` file or database credentials.

## Container deployment

Build and run locally:

```bash
docker build -t civicflow .
docker run --rm -p 3001:3001 --env-file .env civicflow
```

The same Dockerfile can be deployed to a container host. Configure the environment variables in the host's secret manager, attach a PostgreSQL database, and route HTTPS traffic to port `3001`.

## Checks before release

```bash
npm ci
npm run lint
npm test
npm run build
```

After deployment, verify `GET /api/health` returns `status: ok`, registration and sign-in work over HTTPS, and browser cookies include `Secure` and `HttpOnly`.

## Security included

- Passwords are hashed with scrypt and unique salts.
- Session tokens are random and stored as SHA-256 hashes.
- Authentication attempts and API traffic are rate limited.
- Helmet applies hardened HTTP headers and a production content security policy.
- Mutating API requests can be restricted to `APP_ORIGIN`.
- Production cookies use `HttpOnly`, `SameSite=Lax`, and `Secure`.

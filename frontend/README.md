# Labbase Frontend

Next.js frontend for the Labbase research collaboration workspace.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run predeploy:check
npm run smoke:routes -- https://your-site.example
```

## Local environment

Use `.env.local` for local development. The minimum public variables are:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8100
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

## Production environment

Use the values in [`.env.production.example`](/D:/learnablecat/labbase/frontend/.env.production.example) as the template for Vercel or another production host.

Production rules:

- `NEXT_PUBLIC_API_URL` must not point to `localhost`
- `NEXT_PUBLIC_SUPABASE_URL` must be the live Supabase project URL
- `NEXT_PUBLIC_DEV_BYPASS_AUTH` must be `false`

## Deployment flow

Vercel is configured to run the predeploy gate before the build:

```bash
npm run predeploy:check -- --production
```

That command runs:

1. Lint
2. Typecheck
3. Production build
4. Environment validation

## Post-deploy smoke check

After deployment, run:

```bash
npm run smoke:routes -- https://your-site.example
```

The smoke check probes the main public and authenticated entry routes and fails if a route returns a non-2xx or non-3xx status.

# Deployment

Deploy this directory to Vercel to host the read API at `/api`.

Set `DATABASE_URL` in Vercel. The other contract and RPC variables are only required by the separate indexer worker.

Run `npm run migrate` once against the hosted PostgreSQL database, then deploy `npm run index` to a persistent worker host such as Railway, Render, Fly.io, Cloud Run, or a VPS. Do not run the indexer worker on Vercel: it continuously polls the chain and requires a long-lived process.

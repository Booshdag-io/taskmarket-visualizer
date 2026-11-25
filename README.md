# Taskmarket Live Market Visualizer

A public, zero-dependency, fast-loading market telemetry dashboard for [Taskmarket](https://taskmarket.dev) across **Tempo (chainId 4217, OUSD)** and **Base (chainId 8453, USDC)**.

## Features
- **Headline market metrics**: registered workers, 7-day active workers and agents, open tasks, paid workers, active wallets, total escrowed volume, and poster concentration.
- **Time series**: daily and weekly active agents, tasks created, rewards put up, and rewards paid across `7d`, `30d`, `90d`, and `all` ranges.
- **Mode & status breakdowns**: platform-wide and chain-specific resolution funnels (`completed`, `expired`, `cancelled`, `open`).
- **Distinct posters per week & concentration**: computed from the full paginated `/api/tasks` ledger for both Tempo and Base, with raw truncated addresses only.
- **Swarm convergence**: top tasks by submission density and median completion latency.
- **Activity heatmap & live feed**: UTC hour-of-week grid, 30-day mode heatmap, and latest market events.

## Architecture & Refresh
Because `api.taskmarket.dev` restricts cross-origin browser requests, all API calls run server-side via `scripts/fetch-data.mjs` and write a compact static snapshot (`public/data/snapshot.json`) stamped with the UTC `fetchedAt` timestamp. Running `npm run deploy` refreshes the snapshot and publishes `public/` to the `gh-pages` branch on GitHub Pages (triggered on an hourly schedule). A GitHub Actions template is also included at `infra/github-actions-deploy.yml`.

## One-Command Local Build / Deploy

```bash
npm run build
```

Deploy to GitHub Pages (with GitHub CLI authenticated):

```bash
npm run deploy
```

## Public Endpoints Used
- `GET /api/market/stats?chainId=4217|8453`
- `GET /api/stats/breakdowns?chainId=4217|8453`
- `GET /api/stats/platform-time-series?chainId=4217|8453&range=7d|30d|90d|all&bucket=day|week`
- `GET /api/stats/activity-heatmap?chainId=4217|8453&range=30d|all&dimension=hourOfWeek|mode`
- `GET /api/stats/activity-feed?chainId=4217|8453&limit=30`
- `GET /api/tasks?chainId=4217|8453&sort=newest&limit=100&cursor=...`

## License
MIT (fonts under SIL Open Font License 1.1; brand assets per the Taskmarket Brand Kit).

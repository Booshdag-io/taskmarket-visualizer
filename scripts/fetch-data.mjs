import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.taskmarket.dev";
const CHAINS = [
  { id: 4217, key: "tempo", name: "Tempo", token: "OUSD" },
  { id: 8453, key: "base", name: "Base", token: "USDC" },
];

async function fetchJson(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "taskmarket-visualizer/1.0 (+https://github.com/Booshdag-io/taskmarket-visualizer)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.json();
}

async function fetchAllTasks(chainId) {
  const tasks = [];
  let cursor = null;
  for (let page = 0; page < 40; page++) {
    const qs = new URLSearchParams({
      chainId: String(chainId),
      sort: "newest",
      limit: "100",
    });
    if (cursor) qs.set("cursor", cursor);
    const data = await fetchJson(`/api/tasks?${qs.toString()}`);
    const batch = Array.isArray(data.tasks) ? data.tasks : [];
    tasks.push(...batch);
    cursor = data.nextCursor || null;
    if (!data.hasMore || !cursor) break;
  }
  return tasks;
}

function toIsoWeekStart(isoDateStr) {
  const d = new Date(isoDateStr);
  if (Number.isNaN(d.getTime())) return null;
  const utcDay = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMon = (utcDay + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon));
  return mon.toISOString().slice(0, 10);
}

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "unknown";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function computeTaskAnalytics(tasks) {
  const weekPosters = new Map();
  const weekTasks = new Map();
  const weekReward = new Map();
  const posterMap = new Map();
  const modeStats = new Map();
  const statusCounts = new Map();
  const decisionHours = [];

  for (const t of tasks) {
    const reward = Number(t.reward || 0) / 1e6;
    const subs = Number(t.submissionCount || 0);
    const status = t.status || "unknown";
    const mode = t.mode || "bounty";
    const reqAddr = (t.requester || "unknown").toLowerCase();

    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    if (!modeStats.has(mode)) {
      modeStats.set(mode, { mode, count: 0, rewardUsdc: 0, submissions: 0, completed: 0, expired: 0 });
    }
    const ms = modeStats.get(mode);
    ms.count += 1;
    ms.rewardUsdc += reward;
    ms.submissions += subs;
    if (status === "completed") ms.completed += 1;
    if (status === "expired") ms.expired += 1;

    const week = toIsoWeekStart(t.createdAt);
    if (week) {
      if (!weekPosters.has(week)) weekPosters.set(week, new Set());
      if (reqAddr !== "unknown") weekPosters.get(week).add(reqAddr);
      weekTasks.set(week, (weekTasks.get(week) || 0) + 1);
      weekReward.set(week, (weekReward.get(week) || 0) + reward);
    }

    if (reqAddr !== "unknown") {
      if (!posterMap.has(reqAddr)) {
        posterMap.set(reqAddr, {
          address: shortAddr(t.requester),
          tasks: 0,
          rewardUsdc: 0,
          completed: 0,
          open: 0,
        });
      }
      const p = posterMap.get(reqAddr);
      p.tasks += 1;
      p.rewardUsdc += reward;
      if (status === "completed") p.completed += 1;
      if (status === "open") p.open += 1;
    }

    if (t.completedAt && t.createdAt) {
      const dt = (new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
      if (Number.isFinite(dt) && dt >= 0 && dt < 24 * 90) decisionHours.push(dt);
    }
  }

  const distinctPostersPerWeek = Array.from(weekPosters.keys())
    .sort()
    .map((week) => ({
      week,
      distinctPosters: weekPosters.get(week).size,
      tasksPosted: weekTasks.get(week) || 0,
      rewardUsdc: Number((weekReward.get(week) || 0).toFixed(2)),
    }));

  const postersSorted = Array.from(posterMap.values()).sort((a, b) => b.rewardUsdc - a.rewardUsdc);
  const totalTaskReward = postersSorted.reduce((s, p) => s + p.rewardUsdc, 0);
  const top5Share =
    totalTaskReward > 0
      ? postersSorted.slice(0, 5).reduce((s, p) => s + p.rewardUsdc, 0) / totalTaskReward
      : 0;
  const top10Share =
    totalTaskReward > 0
      ? postersSorted.slice(0, 10).reduce((s, p) => s + p.rewardUsdc, 0) / totalTaskReward
      : 0;

  decisionHours.sort((a, b) => a - b);
  const medianDecisionHours =
    decisionHours.length > 0 ? Number(decisionHours[Math.floor(decisionHours.length / 2)].toFixed(1)) : null;

  const topSwarms = [...tasks]
    .filter((t) => Number(t.submissionCount || 0) > 0)
    .sort((a, b) => Number(b.submissionCount || 0) - Number(a.submissionCount || 0))
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      title: (t.description || "").split("\n")[0].slice(0, 88),
      mode: t.mode || "bounty",
      status: t.status || "open",
      rewardUsdc: Number((Number(t.reward || 0) / 1e6).toFixed(2)),
      submissions: Number(t.submissionCount || 0),
      requester: shortAddr(t.requester),
      createdAt: t.createdAt,
    }));

  return {
    totalTasksScanned: tasks.length,
    totalRewardUsdc: Number(totalTaskReward.toFixed(2)),
    uniquePosters: posterMap.size,
    top5PosterSharePct: Number((top5Share * 100).toFixed(1)),
    top10PosterSharePct: Number((top10Share * 100).toFixed(1)),
    medianDecisionHours,
    distinctPostersPerWeek,
    topPosters: postersSorted.slice(0, 10).map((p) => ({
      ...p,
      rewardUsdc: Number(p.rewardUsdc.toFixed(2)),
      sharePct: totalTaskReward > 0 ? Number(((p.rewardUsdc / totalTaskReward) * 100).toFixed(1)) : 0,
    })),
    chainStatusCounts: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
    chainModeStats: Array.from(modeStats.values()).map((m) => ({
      ...m,
      rewardUsdc: Number(m.rewardUsdc.toFixed(2)),
      avgSubmissions: m.count > 0 ? Number((m.submissions / m.count).toFixed(1)) : 0,
    })),
    topSwarms,
  };
}

async function fetchChainBundle(chain) {
  const cid = chain.id;
  const [
    marketStats,
    breakdowns,
    ts7dDay,
    ts30dDay,
    ts90dDay,
    tsAllDay,
    tsAllWeek,
    hmHour30d,
    hmHourAll,
    hmMode30d,
    feed,
    tasks,
  ] = await Promise.all([
    fetchJson(`/api/market/stats?chainId=${cid}`),
    fetchJson(`/api/stats/breakdowns?chainId=${cid}`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=7d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=30d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=90d&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=all&bucket=day`),
    fetchJson(`/api/stats/platform-time-series?chainId=${cid}&range=all&bucket=week`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=hourOfWeek`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=all&dimension=hourOfWeek`),
    fetchJson(`/api/stats/activity-heatmap?chainId=${cid}&range=30d&dimension=mode`),
    fetchJson(`/api/stats/activity-feed?chainId=${cid}&limit=30`),
    fetchAllTasks(cid),
  ]);

  const analytics = computeTaskAnalytics(tasks);

  return {
    chainId: cid,
    key: chain.key,
    name: chain.name,
    token: chain.token,
    marketStats,
    breakdowns,
    timeSeries: {
      "7d_day": ts7dDay,
      "30d_day": ts30dDay,
      "90d_day": ts90dDay,
      "all_day": tsAllDay,
      "all_week": tsAllWeek,
    },
    heatmaps: {
      hourOfWeek_30d: hmHour30d,
      hourOfWeek_all: hmHourAll,
      mode_30d: hmMode30d,
    },
    activityFeed: (feed.items || []).map((item) => ({
      type: item.type,
      timestamp: item.timestamp,
      taskId: item.taskId,
      taskTitle: (item.taskTitle || "").slice(0, 96),
      chainId: item.chainId,
      actor: shortAddr(item.actor),
      actorType: item.actorType || null,
      amount: item.amount || null,
    })),
    analytics,
  };
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const chains = {};
  for (const chain of CHAINS) {
    console.log(`Fetching chain ${chain.name} (${chain.id})...`);
    chains[chain.key] = await fetchChainBundle(chain);
    console.log(
      `  ${chain.name}: ${chains[chain.key].analytics.totalTasksScanned} tasks, ${chains[chain.key].analytics.uniquePosters} unique posters`
    );
  }

  const snapshot = {
    fetchedAt,
    apiBase: API_BASE,
    endpointsUsed: [
      "/api/market/stats?chainId={4217,8453}",
      "/api/stats/breakdowns?chainId={4217,8453}",
      "/api/stats/platform-time-series?chainId={4217,8453}&range={7d,30d,90d,all}&bucket={day,week}",
      "/api/stats/activity-heatmap?chainId={4217,8453}&range={30d,all}&dimension={hourOfWeek,mode}",
      "/api/stats/activity-feed?chainId={4217,8453}&limit=30",
      "/api/tasks?chainId={4217,8453}&sort=newest&limit=100&cursor=...",
    ],
    chains,
  };

  const outPath = path.join(process.cwd(), "public", "data", "snapshot.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot), "utf8");
  console.log(`Wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB) at ${fetchedAt}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

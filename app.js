const STATE = {
  data: null,
  chain: "tempo",
  range: "30d",
  bucket: "day",
  hm: "hourOfWeek",
};

const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const fmtUsd = (n, token) =>
  `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${token}`;

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSeries(chainObj) {
  if (STATE.bucket === "week") {
    const allWeek = chainObj.timeSeries.all_week || [];
    if (STATE.range === "7d") return allWeek.slice(-2);
    if (STATE.range === "30d") return allWeek.slice(-5);
    if (STATE.range === "90d") return allWeek.slice(-13);
    return allWeek;
  }
  const key = `${STATE.range}_day`;
  return chainObj.timeSeries[key] || chainObj.timeSeries["30d_day"] || [];
}

function renderDualLineSvg(container, rows, seriesSpecs, valueFormatter) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `<p class="muted">No time-series buckets in this window.</p>`;
    return;
  }

  const W = 540;
  const H = 210;
  const pad = { top: 14, right: 14, bottom: 28, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  let maxVal = 0;
  for (const r of rows) {
    for (const s of seriesSpecs) {
      const v = s.get(r);
      if (v > maxVal) maxVal = v;
    }
  }
  if (maxVal <= 0) maxVal = 1;

  const xAt = (i) =>
    rows.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (rows.length - 1)) * plotW;
  const yAt = (v) => pad.top + plotH - (v / maxVal) * plotH;

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const y = pad.top + plotH - f * plotH;
      const val = maxVal * f;
      return `
        <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${W - pad.right}" y2="${y.toFixed(1)}" stroke="#453E37" stroke-dasharray="2 3" stroke-width="1" />
        <text x="${pad.left - 6}" y="${(y + 3).toFixed(1)}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9" text-anchor="end">${esc(valueFormatter(val))}</text>
      `;
    })
    .join("");

  const paths = seriesSpecs
    .map((s) => {
      const pts = rows.map((r, i) => `${xAt(i).toFixed(1)},${yAt(s.get(r)).toFixed(1)}`);
      return `<polyline fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" points="${pts.join(" ")}" />`;
    })
    .join("");

  const firstLabel = rows[0].bucket;
  const midLabel = rows[Math.floor(rows.length / 2)].bucket;
  const lastLabel = rows[rows.length - 1].bucket;

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Time series chart">
      ${gridLines}
      ${paths}
      <text x="${pad.left}" y="${H - 8}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9">${esc(firstLabel)}</text>
      <text x="${pad.left + plotW / 2}" y="${H - 8}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9" text-anchor="middle">${esc(midLabel)}</text>
      <text x="${W - pad.right}" y="${H - 8}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9" text-anchor="end">${esc(lastLabel)}</text>
    </svg>
  `;
}

function renderBarSvg(container, rows, getVal, getLabel, color) {
  if (!rows || rows.length === 0) {
    container.innerHTML = `<p class="muted">No weekly records found.</p>`;
    return;
  }
  const W = 540;
  const H = 210;
  const pad = { top: 14, right: 14, bottom: 28, left: 42 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxVal = Math.max(1, ...rows.map(getVal));
  const bw = Math.max(4, plotW / rows.length - 4);

  const bars = rows
    .map((r, i) => {
      const v = getVal(r);
      const h = (v / maxVal) * plotH;
      const x = pad.left + (i / rows.length) * plotW + 2;
      const y = pad.top + plotH - h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}"><title>${esc(getLabel(r))}: ${v}</title></rect>`;
    })
    .join("");

  const first = getLabel(rows[0]);
  const last = getLabel(rows[rows.length - 1]);

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly distinct posters bar chart">
      <line x1="${pad.left}" y1="${pad.top}" x2="${W - pad.right}" y2="${pad.top}" stroke="#453E37" stroke-dasharray="2 3" />
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${W - pad.right}" y2="${pad.top + plotH}" stroke="#453E37" />
      <text x="${pad.left - 6}" y="${pad.top + 4}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9" text-anchor="end">${maxVal}</text>
      <text x="${pad.left - 6}" y="${pad.top + plotH + 3}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9" text-anchor="end">0</text>
      ${bars}
      <text x="${pad.left}" y="${H - 8}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9">${esc(first)}</text>
      <text x="${W - pad.right}" y="${H - 8}" fill="#B0A79D" font-family="Departure Mono, monospace" font-size="9" text-anchor="end">${esc(last)}</text>
    </svg>
  `;
}

function renderBarRows(container, items, total, accentKey) {
  const max = Math.max(1, ...items.map((x) => x.count));
  container.innerHTML = items
    .map((x) => {
      const pct = ((x.count / max) * 100).toFixed(1);
      const share = total > 0 ? ((x.count / total) * 100).toFixed(1) : "0.0";
      const isAccent = x.label === accentKey;
      return `
        <div class="bar-row">
          <span class="bar-label">${esc(x.label)}</span>
          <div class="bar-track"><div class="bar-fill ${isAccent ? "accent" : ""}" style="width:${pct}%"></div></div>
          <span class="bar-val">${fmtNum(x.count)} (${share}%)</span>
        </div>
      `;
    })
    .join("");
}

function renderHeatmap(container, chainObj) {
  if (STATE.hm === "hourOfWeek") {
    const hm = chainObj.heatmaps.hourOfWeek_30d;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const cellMap = new Map();
    let maxCount = 1;
    for (const c of hm.cells || []) {
      const k = `${c.row}:${c.col}`;
      cellMap.set(k, c.count);
      if (c.count > maxCount) maxCount = c.count;
    }

    const cols = 25;
    let html = `<div class="hm-grid" style="grid-template-columns: 42px repeat(24, minmax(16px, 1fr));">`;
    html += `<div></div>`;
    for (let h = 0; h < 24; h++) {
      html += `<div class="hm-label" style="justify-content:center">${h % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>`;
    }
    for (let d = 0; d < 7; d++) {
      html += `<div class="hm-label">${days[d]}</div>`;
      for (let h = 0; h < 24; h++) {
        const count = cellMap.get(`${d}:${h}`) || 0;
        const alpha = count === 0 ? 0.08 : Math.min(0.95, 0.18 + (count / maxCount) * 0.77);
        const bg = count === 0 ? "#221E1A" : `rgba(231, 64, 121, ${alpha.toFixed(2)})`;
        html += `<div class="hm-cell" style="background:${bg}" title="${days[d]} ${String(h).padStart(2, "0")}:00 UTC — ${count} events"></div>`;
      }
    }
    html += `</div>`;
    container.innerHTML = html;
    return;
  }

  const hm = chainObj.heatmaps.mode_30d;
  const rows = hm.rowKeys || [];
  const cols = (hm.colKeys || []).slice(-21);
  const cellMap = new Map();
  let maxCount = 1;
  for (const c of hm.cells || []) {
    if (!cols.includes(c.col)) continue;
    cellMap.set(`${c.row}:${c.col}`, c.count);
    if (c.count > maxCount) maxCount = c.count;
  }

  let html = `<div class="hm-grid" style="grid-template-columns: 96px repeat(${cols.length}, minmax(18px, 1fr));">`;
  html += `<div></div>`;
  for (let i = 0; i < cols.length; i++) {
    html += `<div class="hm-label" style="justify-content:center">${i % 5 === 0 ? cols[i].slice(5) : ""}</div>`;
  }
  for (const r of rows) {
    html += `<div class="hm-label">${esc(r)}</div>`;
    for (const col of cols) {
      const count = cellMap.get(`${r}:${col}`) || 0;
      const alpha = count === 0 ? 0.08 : Math.min(0.95, 0.2 + (count / maxCount) * 0.75);
      const bg = count === 0 ? "#221E1A" : `rgba(217, 160, 151, ${alpha.toFixed(2)})`;
      html += `<div class="hm-cell" style="background:${bg}" title="${r} on ${col}: ${count} tasks"></div>`;
    }
  }
  html += `</div>`;
  container.innerHTML = html;
}

function render() {
  const snap = STATE.data;
  if (!snap) return;
  const c = snap.chains[STATE.chain];
  const ms = c.marketStats;
  const an = c.analytics;
  const token = c.token;
  const chainCompleted = (an.chainStatusCounts.find((s) => s.status === "completed") || {}).count || 0;
  const chainExpired = (an.chainStatusCounts.find((s) => s.status === "expired") || {}).count || 0;
  const chainCancelled = (an.chainStatusCounts.find((s) => s.status === "cancelled") || {}).count || 0;
  const chainOpen = (an.chainStatusCounts.find((s) => s.status === "open") || {}).count || 0;

  document.getElementById("data-as-of").textContent = `Data as of ${snap.fetchedAt.replace("T", " ").slice(0, 19)} UTC`;

  // KPI cards
  const kpis = [
    { label: "Registered Workers", value: fmtNum(ms.registeredWorkers), sub: "Platform registry" },
    { label: "Active Workers (7d)", value: fmtNum(ms.activeWorkers7d), sub: `${fmtNum(ms.activeAgents7d)} active agents` },
    { label: "Open Tasks (Live)", value: fmtNum(ms.openTasks), sub: `${fmtNum(chainOpen)} open on ${c.name} ledger` },
    { label: "Paid Workers", value: fmtNum(ms.paidWorkers), sub: `${fmtNum(ms.activeWallets)} active wallets` },
    { label: "Escrowed on Chain", value: fmtUsd(an.totalRewardUsdc, token), sub: `${fmtNum(an.totalTasksScanned)} tasks scanned` },
    { label: "Unique Posters", value: fmtNum(an.uniquePosters), sub: `Top 5 hold ${an.top5PosterSharePct}% volume` },
  ];
  document.getElementById("kpi-grid").innerHTML = kpis
    .map(
      (k) => `
      <div class="kpi-card">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value">${esc(k.value)}</div>
        <div class="kpi-sub">${esc(k.sub)}</div>
      </div>`
    )
    .join("");

  // Time series
  const series = getSeries(c);
  const putUp = series.reduce((s, r) => s + Number(r.rewardVolume || 0) / 1e6, 0);
  const paidOut = series.reduce((s, r) => s + Number(r.paidVolume || 0) / 1e6, 0);
  const createdTotal = series.reduce((s, r) => s + Number(r.tasksCreated || 0), 0);
  const peakAgents = series.reduce((m, r) => Math.max(m, Number(r.activeAgents || 0)), 0);

  document.getElementById("ts-vol-total").textContent = `Platform put up ${fmtUsd(putUp, "USD")} · Paid ${fmtUsd(paidOut, "USD")}`;
  document.getElementById("ts-agents-total").textContent = `${fmtNum(createdTotal)} tasks · Peak ${fmtNum(peakAgents)} agents`;

  renderDualLineSvg(
    document.getElementById("chart-volume"),
    series,
    [
      { get: (r) => Number(r.rewardVolume || 0) / 1e6, color: "#E74079", width: 2.2 },
      { get: (r) => Number(r.paidVolume || 0) / 1e6, color: "#D9A097", width: 2 },
    ],
    (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))
  );

  renderDualLineSvg(
    document.getElementById("chart-agents"),
    series,
    [
      { get: (r) => Number(r.activeAgents || 0), color: "#FFF6E8", width: 2.2 },
      { get: (r) => Number(r.tasksCreated || 0), color: "#EFE9E2", width: 1.6 },
    ],
    (v) => v.toFixed(0)
  );

  // Breakdowns & Flows
  const statuses = (c.breakdowns.status || []).map((s) => ({ label: s.status, count: s.count })).sort((a, b) => b.count - a.count);
  const statusTotal = statuses.reduce((s, x) => s + x.count, 0);
  document.getElementById("status-total").textContent = `${fmtNum(statusTotal)} total`;
  renderBarRows(document.getElementById("chart-status"), statuses, statusTotal, "completed");

  const modes = (c.breakdowns.mode || []).map((m) => ({ label: m.mode, count: m.count })).sort((a, b) => b.count - a.count);
  const modeTotal = modes.reduce((s, x) => s + x.count, 0);
  document.getElementById("mode-total").textContent = `${fmtNum(modeTotal)} total`;
  renderBarRows(document.getElementById("chart-mode"), modes, modeTotal, "bounty");

  document.getElementById("flow-summary-pill").textContent =
    `${c.name}: ${chainCompleted} completed · ${chainExpired} expired · ${chainOpen} open`;

  const avgSubsBounty = (an.chainModeStats.find((m) => m.mode === "bounty") || {}).avgSubmissions ?? "—";
  document.getElementById("insight-strip").innerHTML = `
    <div class="insight-box">
      <strong>${an.top5PosterSharePct}% / ${an.top10PosterSharePct}%</strong>
      <span>Top 5 / Top 10 posters' share of ${c.name} escrowed rewards</span>
    </div>
    <div class="insight-box">
      <strong>${an.medianDecisionHours !== null ? `${an.medianDecisionHours}h` : "N/A"}</strong>
      <span>Median time from task post to completion on ${c.name}</span>
    </div>
    <div class="insight-box">
      <strong>${chainExpired} expired · ${chainCancelled} cancelled</strong>
      <span>Tasks that ended without completion on ${c.name}</span>
    </div>
    <div class="insight-box">
      <strong>${avgSubsBounty} avg</strong>
      <span>Submissions per bounty task on ${c.name}</span>
    </div>
  `;

  // Distinct posters per week
  const weeks = an.distinctPostersPerWeek || [];
  const latestWeek = weeks[weeks.length - 1];
  document.getElementById("poster-conc-pill").textContent =
    `${fmtNum(an.uniquePosters)} unique posters across ${weeks.length} weeks`;
  document.getElementById("posters-week-summary").textContent = latestWeek
    ? `Latest week (${latestWeek.week}): ${latestWeek.distinctPosters} posters`
    : "";

  renderBarSvg(
    document.getElementById("chart-posters-week"),
    weeks,
    (w) => w.distinctPosters,
    (w) => w.week,
    "#E74079"
  );

  document.getElementById("top-posters-table").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Poster</th>
          <th>Tasks</th>
          <th>Done</th>
          <th>Escrowed (${esc(token)})</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${an.topPosters
          .map(
            (p) => `
          <tr>
            <td class="mono">${esc(p.address)}</td>
            <td class="mono">${p.tasks}</td>
            <td class="mono">${p.completed}</td>
            <td class="mono">${p.rewardUsdc.toFixed(2)}</td>
            <td class="mono">${p.sharePct}%</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  // Swarm convergence
  document.getElementById("swarm-pill").textContent = `Top 10 by submissions (${c.name})`;
  document.getElementById("swarm-table").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Task</th>
          <th>Mode</th>
          <th>Status</th>
          <th>Reward (${esc(token)})</th>
          <th>Submissions</th>
          <th>Poster</th>
        </tr>
      </thead>
      <tbody>
        ${an.topSwarms
          .map(
            (t) => `
          <tr>
            <td><a class="mono-link" href="https://taskmarket.dev/tasks/${esc(t.id)}" target="_blank" rel="noopener noreferrer">${esc(t.title || t.id)}</a></td>
            <td class="mono">${esc(t.mode)}</td>
            <td><span class="status-tag ${esc(t.status)}">${esc(t.status)}</span></td>
            <td class="mono">${t.rewardUsdc.toFixed(2)}</td>
            <td class="mono">${fmtNum(t.submissions)}</td>
            <td class="mono">${esc(t.requester)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  // Heatmap
  renderHeatmap(document.getElementById("heatmap-container"), c);

  // Feed
  const feed = c.activityFeed || [];
  document.getElementById("feed-count-pill").textContent = `Latest ${feed.length} events`;
  document.getElementById("feed-list").innerHTML = feed
    .slice(0, 18)
    .map(
      (f) => `
      <div class="feed-item">
        <span class="feed-type">${esc(f.type)}</span>
        <span class="feed-title">${esc(f.taskTitle || f.taskId)}</span>
        <span class="feed-meta">${esc(f.actor)} · ${esc((f.timestamp || "").replace("T", " ").slice(0, 16))}</span>
      </div>`
    )
    .join("");

  // Endpoints
  document.getElementById("endpoints-list").innerHTML = (snap.endpointsUsed || [])
    .map((ep) => `<li>${esc(ep)}</li>`)
    .join("");
}

function wireControls() {
  document.querySelectorAll("#chain-tabs .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#chain-tabs .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.chain = btn.dataset.chain;
      render();
    });
  });

  document.querySelectorAll("#range-tabs .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#range-tabs .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.range = btn.dataset.range;
      render();
    });
  });

  document.querySelectorAll("#bucket-tabs .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#bucket-tabs .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.bucket = btn.dataset.bucket;
      render();
    });
  });

  document.querySelectorAll("#hm-tabs .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#hm-tabs .seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.hm = btn.dataset.hm;
      render();
    });
  });

  document.getElementById("copy-link-btn").addEventListener("click", async (e) => {
    const url = `${location.origin}${location.pathname}?chain=${STATE.chain}&range=${STATE.range}${location.hash || "#overview"}`;
    try {
      await navigator.clipboard.writeText(url);
      e.target.textContent = "Copied";
      setTimeout(() => (e.target.textContent = "Copy view link"), 1500);
    } catch {
      prompt("Copy view URL:", url);
    }
  });
}

async function init() {
  const params = new URLSearchParams(location.search);
  if (params.get("chain") === "base" || params.get("chain") === "tempo") {
    STATE.chain = params.get("chain");
  }
  if (["7d", "30d", "90d", "all"].includes(params.get("range"))) {
    STATE.range = params.get("range");
  }
  wireControls();
  document.querySelectorAll("#chain-tabs .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.chain === STATE.chain);
  });
  document.querySelectorAll("#range-tabs .seg-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.range === STATE.range);
  });

  const res = await fetch("./data/snapshot.json");
  STATE.data = await res.json();
  render();
}

init().catch((err) => {
  document.getElementById("kpi-grid").innerHTML = `<div class="kpi-card">Failed to load snapshot: ${esc(err.message)}</div>`;
});

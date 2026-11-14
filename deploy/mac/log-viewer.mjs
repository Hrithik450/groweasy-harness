#!/usr/bin/env node
/**
 * Read-only log viewer for the Mac host.
 *
 * Serves a single page that tails the service logs. Caddy puts basic auth in
 * front of it at /_logs/, so this process binds no interface and does no
 * authentication of its own — it must never be exposed directly.
 *
 * Only files from FILES can be requested; the name is looked up in that map,
 * never joined from the request, so a crafted name cannot escape the log
 * directory.
 *
 * Caddy writes structured JSON, which is unreadable as a wall of text, so
 * those lines are parsed here into rows the page renders as a table. Files
 * that are not JSON (the gateway and deploy logs) fall back to plain lines.
 *
 * @module @openai-harness/log-viewer
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Self-locating: the viewer is installed at $HARNESS_ROOT/config/, so the
// logs are its sibling `../logs`.
const LOG_DIR = process.env.LOG_DIR ?? path.join(import.meta.dirname, "..", "logs");
const PORT = Number(process.env.LOG_VIEWER_PORT ?? 7890);
const DEFAULT_LINES = 400;
const MAX_LINES = 2000;

/**
 * Sidebar contents: log name → file, grouped the way an operator reaches for
 * them.
 */
const GROUPS = [
  {
    label: "Services",
    entries: [
      { name: "gateway", file: "gateway.log", hint: "app life cycle" },
      { name: "gateway-errors", file: "gateway.err.log", hint: "stderr" },
    ],
  },
  {
    label: "HTTP",
    entries: [
      { name: "caddy", file: "caddy.log", hint: "access log" },
      { name: "caddy-errors", file: "caddy.err.log", hint: "proxy / tls" },
    ],
  },
  {
    label: "Platform",
    entries: [
      { name: "tunnel", file: "tunnel.err.log", hint: "cloudflare" },
      { name: "autodeploy", file: "autodeploy.log", hint: "push → deploy" },
    ],
  },
];

/** Flat name → file lookup used by the API. */
const FILES = Object.fromEntries(
  GROUPS.flatMap((group) => group.entries.map((entry) => [entry.name, entry.file])),
);

/** Read the last `count` lines without loading the whole file. */
function tailLines(file, count) {
  let handle;
  try {
    handle = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const { size } = fs.fstatSync(handle);
    const window = Math.min(size, 512 * 1024);
    const buffer = Buffer.alloc(window);
    fs.readSync(handle, buffer, 0, window, size - window);
    const text = buffer.toString("utf8");
    const lines = text.split("\n");
    // The first line is usually partial when the window is bounded; the last
    // one is empty because log files end with a newline.
    if (window < size) lines.shift();
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-count);
  } finally {
    fs.closeSync(handle);
  }
}

/**
 * Every timestamp is rendered in IST (UTC+5:30, no DST), regardless of where
 * the line came from: Caddy writes epoch seconds, cloudflared writes UTC
 * "…Z" stamps, and the deploy script writes local time. The offset is applied
 * by hand so the output does not depend on the host's own timezone setting.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `HH:MM:SS` in IST. */
function istTime(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(11, 19);
}

/** `DD Mon` in IST. */
function istDayLabel(ms) {
  const shifted = new Date(ms + IST_OFFSET_MS);
  return `${String(shifted.getUTCDate())} ${MONTHS[shifted.getUTCMonth()]}`;
}

/** Time alone for today, `DD Mon HH:MM:SS` for anything older. */
function stamp(ms) {
  if (!Number.isFinite(ms)) return "";
  const shifted = new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
  const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
  return shifted === today ? istTime(ms) : `${istDayLabel(ms)} ${istTime(ms)}`;
}

/** Compact age: `12s`, `4m`, `3h`, `2d`. */
function ageOf(ms) {
  if (!Number.isFinite(ms)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${String(seconds)}s`;
  if (seconds < 3600) return `${String(Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${String(Math.round(seconds / 3600))}h`;
  return `${String(Math.round(seconds / 86400))}d`;
}

/**
 * Rewrite UTC ISO stamps inside a plain-text line — cloudflared's
 * `2026-11-14T08:50:19Z` becomes `14:20:19`. Lines without a trailing `Z`
 * (the deploy log writes local time already) are left alone.
 */
function localizeTimestamps(line) {
  return line.replace(
    /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z\b/g,
    (_match, y, mo, d, h, mi, s) =>
      stamp(Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)),
  );
}

/**
 * Classify one raw line.
 *
 * @returns an access row, a structured log row, or a plain line.
 */
function classify(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return { type: "text", text: localizeTimestamps(line) };

  let entry;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    return { type: "text", text: localizeTimestamps(line) };
  }

  const tsMs = typeof entry.ts === "number" ? entry.ts * 1000 : Number.NaN;
  const t = stamp(tsMs);
  const age = ageOf(tsMs);

  // Access log: `request` + numeric `status`.
  if (entry.request !== undefined && typeof entry.status === "number") {
    const request = entry.request;
    const headers = request.headers ?? {};
    return {
      type: "access",
      t,
      age,
      method: String(request.method ?? ""),
      uri: String(request.uri ?? ""),
      status: entry.status,
      ms: Math.round((typeof entry.duration === "number" ? entry.duration : 0) * 1000),
      size: typeof entry.size === "number" ? entry.size : 0,
      ip: String(
        headers["Cf-Connecting-Ip"]?.[0] ?? request.client_ip ?? request.remote_ip ?? "",
      ),
    };
  }

  // Caddy's own runtime log: `level` + `msg`.
  if (typeof entry.level === "string" || typeof entry.msg === "string") {
    return {
      type: "log",
      t,
      age,
      level: String(entry.level ?? "info"),
      logger: String(entry.logger ?? "").replace(/^http\./, ""),
      msg: String(entry.msg ?? ""),
    };
  }

  return { type: "text", text: localizeTimestamps(line) };
}

/**
 * Fold the deploy log into one item per deploy attempt.
 *
 * The log is a flat event stream: `deploying <sha>` opens an attempt and
 * `deploy succeeded at <sha>` / `deploy FAILED at <sha>` closes it, with
 * warnings and fast-forward notices in between. An attempt with no closing
 * event is still running. Items come back newest first.
 */
function parseDeploys(lines) {
  const stampOf = (line) => {
    const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]/);
    // The deploy log writes local time already (no trailing Z), and the host
    // is IST, so parse it as IST rather than shifting it again.
    return match ? Date.parse(`${match[1]}+05:30`) : Number.NaN;
  };

  const items = [];
  let open = null;
  let stray = null;

  for (const line of lines) {
    const at = stampOf(line);

    const started = line.match(/deploying ([0-9a-f]{7,40})/);
    if (started !== null) {
      const buildMatch = line.match(/\(build: builds\/([\w.-]+\.log)\)/);
      // Seven characters: the same short SHA GitHub shows.
      open = {
        sha: started[1].slice(0, 7),
        build: buildMatch === null ? "" : buildMatch[1],
        start: at,
        end: null,
        status: "running",
        detail: [],
      };
      items.push(open);
      continue;
    }

    const succeeded = line.match(/deploy succeeded at ([0-9a-f]{7,40})/);
    if (succeeded !== null && open !== null) {
      open.status = "success";
      open.end = at;
      open.detail.push(line);
      open = null;
      continue;
    }

    const failed = line.match(/deploy FAILED at ([0-9a-f]{7,40}).*?\((\d+)\/(\d+)\)/);
    if (failed !== null && open !== null) {
      open.status = "failed";
      open.end = at;
      open.attempts = `${failed[2]}/${failed[3]}`;
      open.detail.push(line);
      open = null;
      continue;
    }

    if (open !== null) {
      open.detail.push(line);
      continue;
    }

    // Anything outside an attempt (poller start, fast-forwards, diverged
    // branches) becomes its own informational item.
    if (stray === null) {
      stray = { sha: "", start: at, end: null, status: "info", detail: [] };
      items.push(stray);
    }
    stray.detail.push(line);
  }

  return items.reverse().map((item) => ({
    sha: item.sha,
    build: item.build ?? "",
    t: stamp(item.start),
    age: ageOf(item.start),
    status: item.status,
    duration:
      item.end !== null && Number.isFinite(item.end) && Number.isFinite(item.start)
        ? `${String(Math.floor((item.end - item.start) / 60000))}m ${String(Math.round(((item.end - item.start) % 60000) / 1000))}s`
        : "",
    attempts: item.attempts ?? "",
    detail: item.detail.slice(-40),
  }));
}

/**
 * Pick one presentation for the whole window: a mixed file would otherwise
 * need a different column set per row.
 */
function shapeOf(rows) {
  if (rows.length === 0) return "text";
  if (rows.every((row) => row.type === "access")) return "access";
  if (rows.every((row) => row.type === "log")) return "log";
  return "text";
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logs — uno.mhrithik.com</title>
<style>
  @font-face{font-family:'CursorGothic';src:url('/fonts/CursorGothic_Regular.woff2') format('woff2');font-weight:400;font-display:swap}
  @font-face{font-family:'GeistMono';src:url('/fonts/GeistMono_Variable.woff2') format('woff2');font-weight:100 900;font-display:swap}

  :root{
    --paper:#F3EFE4; --card:#FBF9F3; --ink:#0E0E0E; --muted:#EDE8DB; --muted-2:#E4DED0;
    --dim:#6B6657; --hair:#D9D3C3; --hair-2:#C9C3B3;
    --accent:#FF4D1C; --accent-soft:#FDEDE6;
    --ok:#1E6B3A; --warn:#C9771A; --bad:#B4402E;
    --sans:'CursorGothic',ui-sans-serif,system-ui,sans-serif;
    --mono:'GeistMono',ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.5 var(--sans);
       display:grid;grid-template-columns:248px 1fr;-webkit-font-smoothing:antialiased}

  /* ── sidebar ── */
  aside{background:var(--card);border-right:1px solid var(--hair);display:flex;flex-direction:column;min-height:100vh}
  .brand{padding:16px 18px 14px;border-bottom:1px solid var(--hair)}
  .brand .name{font-size:14px;letter-spacing:-.01em}
  .brand .sub{font:11px/1.4 var(--mono);color:var(--dim);text-transform:uppercase;letter-spacing:.09em;margin-top:2px}
  nav{padding:10px 0;overflow-y:auto}
  .group{margin-bottom:6px}
  .group > button{width:100%;display:flex;align-items:center;gap:8px;background:none;border:0;
      padding:8px 18px;cursor:pointer;font:11px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
      color:var(--dim);text-align:left}
  .group > button:hover{color:var(--ink)}
  .group > button .chev{transition:transform .15s ease;font-size:9px;color:var(--hair-2)}
  .group[data-open="false"] > button .chev{transform:rotate(-90deg)}
  .group[data-open="false"] .items{display:none}
  .items{list-style:none;margin:0;padding:0}
  .items button{width:100%;display:block;text-align:left;background:none;border:0;cursor:pointer;
      padding:7px 18px 7px 30px;color:var(--dim);font:12px/1.35 var(--mono);
      border-left:2px solid transparent}
  .items button .hint{display:block;font-size:10px;color:var(--hair-2);letter-spacing:.02em}
  .items button:hover{color:var(--ink);background:var(--muted)}
  .items button[aria-current="true"]{color:var(--ink);background:var(--muted-2);border-left-color:var(--accent);font-weight:600}
  .items button[aria-current="true"] .hint{color:var(--dim)}
  .sidefoot{margin-top:auto;padding:12px 18px;border-top:1px solid var(--hair);font:10px/1.5 var(--mono);
      color:var(--hair-2);text-transform:uppercase;letter-spacing:.08em}

  /* ── main ── */
  main{display:flex;flex-direction:column;min-width:0;max-height:100vh}
  .bar{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--hair);
       background:var(--card);position:sticky;top:0;z-index:2}
  .bar h1{margin:0;font-size:13px;font-weight:600;font-family:var(--mono);letter-spacing:.02em}
  .bar .meta{font:11px/1 var(--mono);color:var(--dim);text-transform:uppercase;letter-spacing:.07em}
  .spacer{flex:1}
  .pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--hair-2);background:var(--paper);
        padding:6px 11px;font:11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--dim);cursor:pointer}
  .pill:hover{color:var(--ink);border-color:var(--ink)}
  .pill[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
  .pill.icon{padding:6px 10px;font-size:14px;line-height:1;color:var(--dim)}
  .pill.icon:hover{color:var(--ink)}
  .dot{width:6px;height:6px;background:currentColor;display:inline-block}
  .spin{animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}

  .scroll{overflow:auto;flex:1;background:var(--paper)}

  /* ── table ── */
  table{width:100%;border-collapse:collapse;font:12px/1.5 var(--mono)}
  thead th{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--hair);
      text-align:left;padding:8px 12px;font:10px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--dim);font-weight:600}
  tbody td{padding:5px 12px;border-bottom:1px solid rgba(217,211,195,.55);vertical-align:top}
  tbody tr:hover{background:var(--muted)}
  td.t{color:var(--dim);white-space:nowrap}
  td.a{color:var(--hair-2);white-space:nowrap;font-size:11px;text-align:right}
  td.m{color:var(--ink);font-weight:600;white-space:nowrap}
  td.u{max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  td.n{text-align:right;white-space:nowrap;color:var(--dim)}
  td.s{white-space:nowrap;font-weight:600}
  td.ip{color:var(--dim);white-space:nowrap;font-size:11px}
  .s2{color:var(--ok)} .s3{color:var(--dim)} .s4{color:var(--warn)} .s5{color:var(--bad)}
  .lv-error,.lv-fatal{color:var(--bad)} .lv-warn,.lv-warning{color:var(--warn)}
  .lv-info,.lv-debug{color:var(--ink)}

  /* ── deploy history ── */
  .deploys{display:flex;flex-direction:column}
  .deploy{border-bottom:1px solid var(--hair)}
  .deploy > .row{display:grid;grid-template-columns:26px 84px 1fr 84px 20px;align-items:center;gap:12px;
      width:100%;background:none;border:0;padding:12px 16px;cursor:pointer;text-align:left;font:12px/1.3 var(--mono);color:var(--ink)}
  .deploy > .row:hover{background:var(--muted)}
  /* The deploy in flight owns the whole row, not just its icon. */
  .deploy[data-status="running"] > .row{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}
  .deploy[data-status="running"] > .row:hover{background:var(--accent-soft)}
  .deploy .sha{font-weight:600;letter-spacing:.02em}
  .deploy .sha.dim{color:var(--dim);font-weight:400}
  .deploy .when{color:var(--dim);white-space:nowrap}
  .deploy .when .ago{color:var(--hair-2)}
  .deploy .dur{color:var(--hair-2);text-align:right;white-space:nowrap}
  .deploy .caret{color:var(--hair-2);justify-self:end;transition:transform .15s ease}
  .deploy[data-open="true"] .caret{transform:rotate(180deg)}
  .spinner{width:12px;height:12px;border:2px solid var(--hair-2);border-top-color:var(--accent);border-radius:50%;
      display:inline-block;animation:spin .8s linear infinite}
  .ico-ok{color:var(--ok)} .ico-bad{color:var(--bad)} .ico-info{color:var(--hair-2)}
  .deploy .detail{display:none;margin:0;padding:0 16px 12px 54px;list-style:none}
  .deploy[data-open="true"] .detail{display:block}
  .deploy .detail li{font:11px/1.65 var(--mono);color:var(--dim);white-space:pre-wrap;word-break:break-word;
      border-left:2px solid var(--hair);padding:1px 0 1px 10px}
  .deploy .detail li.sub{margin-top:10px;border-left-color:var(--bad);color:var(--bad);
      font:10px/1.6 var(--mono);letter-spacing:.09em;text-transform:uppercase}
  .deploy .detail li.buildline{color:var(--dim);border-left-color:var(--hair-2);max-height:none}

  /* ── plain text ── */
  ol.log{margin:0;padding:8px 0;list-style:none}
  ol.log li{display:grid;grid-template-columns:56px 1fr;align-items:start}
  ol.log li:hover{background:var(--muted)}
  ol.log .n{font:11px/1.65 var(--mono);color:var(--hair-2);text-align:right;padding:0 12px 0 0;user-select:none}
  ol.log .t{font:12px/1.65 var(--mono);white-space:pre-wrap;word-break:break-word;padding-right:18px}
  .t.ok{color:var(--ok)} .t.warn{color:var(--warn)} .t.bad{color:var(--bad)}
  .empty{padding:28px 18px;color:var(--dim);font:12px var(--mono)}

  @media (max-width:760px){
    body{grid-template-columns:1fr;grid-template-rows:auto 1fr}
    aside{min-height:0;border-right:0;border-bottom:1px solid var(--hair)}
    .items{display:flex;flex-wrap:wrap;gap:2px;padding:0 8px 8px}
    .items li{width:auto}
    .items button{border-left:0;border-bottom:2px solid transparent;padding:6px 10px}
    .items button[aria-current="true"]{border-left:0;border-bottom-color:var(--accent)}
    .items button .hint{display:none}
    main{max-height:none}
    td.ip,th.ip,td.z,th.z,td.a,th.a{display:none}
  }
</style></head>
<body>
<aside>
  <div class="brand">
    <div class="name">uno.mhrithik.com</div>
    <div class="sub">server logs</div>
  </div>
  <nav id="nav"></nav>
  <div class="sidefoot">6 sources · read only</div>
</aside>
<main>
  <div class="bar">
    <h1 id="title">gateway</h1>
    <span class="meta" id="meta"></span>
    <span class="spacer"></span>
    <button class="pill icon" id="refresh" title="Refresh (R)" aria-label="Refresh"><span id="glyph">↻</span></button>
  </div>
  <div class="scroll" id="scroll"></div>
</main>
<script>
const GROUPS = ${JSON.stringify(GROUPS.map((g) => ({ label: g.label, entries: g.entries.map((e) => ({ name: e.name, hint: e.hint })) })))};
// Reader preferences survive a reload: which log was open and which sidebar
// groups were collapsed. localStorage can throw (private windows, cleared
// storage), so every access is guarded and the page works without it.
function readPref(key, fallback){
  try {
    const value = localStorage.getItem('lv:' + key);
    return value === null ? fallback : value;
  } catch { return fallback; }
}
function writePref(key, value){
  try { localStorage.setItem('lv:' + key, value); } catch { /* ignore */ }
}

const allNames = GROUPS.flatMap((g) => g.entries.map((e) => e.name));
const restored = readPref('file', '');
let current = allNames.includes(restored) ? restored : GROUPS[0].entries[0].name;

const nav = document.getElementById('nav');
const scrollEl = document.getElementById('scroll');
const titleEl = document.getElementById('title');
const metaEl = document.getElementById('meta');
const refreshBtn = document.getElementById('refresh');
const glyph = document.getElementById('glyph');
const buttons = new Map();

for (const group of GROUPS) {
  const wrap = document.createElement('div');
  wrap.className = 'group';
  wrap.dataset.group = group.label;
  wrap.dataset.open = readPref('group:' + group.label, 'true') === 'false' ? 'false' : 'true';
  const head = document.createElement('button');
  head.innerHTML = '<span class="chev">▼</span>' + group.label;
  head.onclick = () => {
    wrap.dataset.open = wrap.dataset.open === 'true' ? 'false' : 'true';
    writePref('group:' + group.label, wrap.dataset.open);
  };
  wrap.appendChild(head);
  const list = document.createElement('ul');
  list.className = 'items';
  for (const entry of group.entries) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = '<span>' + entry.name + '</span><span class="hint">' + entry.hint + '</span>';
    b.onclick = () => select(entry.name);
    buttons.set(entry.name, b);
    li.appendChild(b);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  nav.appendChild(wrap);
}

function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function bytes(n){
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}
function statusClass(s){ return s >= 500 ? 's5' : s >= 400 ? 's4' : s >= 300 ? 's3' : 's2'; }
function tone(line){
  if (/\\b(ERROR|error|fatal|Traceback|FAILED|failed|refused)\\b/.test(line)) return 'bad';
  if (/\\b(WARN|warn|warning|retry)\\b/.test(line)) return 'warn';
  if (/\\b(listening|succeeded|success|ok|OPEN|completed)\\b/i.test(line)) return 'ok';
  return '';
}

function table(headers, rows){
  const t = document.createElement('table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h.label; th.className = h.cls || '';
    hr.appendChild(th);
  }
  thead.appendChild(hr); t.appendChild(thead);
  const tb = document.createElement('tbody');
  for (const cells of rows) {
    const tr = document.createElement('tr');
    for (const c of cells) {
      const td = document.createElement('td');
      td.className = c.cls || '';
      td.innerHTML = c.html;
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  return t;
}

function renderAccess(rows){
  return table(
    [{label:'time (IST)',cls:'t'},{label:'age',cls:'a'},{label:'method',cls:'m'},{label:'path',cls:'u'},{label:'status',cls:'s'},{label:'ms',cls:'n'},{label:'size',cls:'n z'},{label:'client',cls:'ip'}],
    rows.map(r => [
      {cls:'t', html: esc(r.t)},
      {cls:'a', html: esc(r.age)},
      {cls:'m', html: esc(r.method)},
      {cls:'u', html: '<span title="' + esc(r.uri) + '">' + esc(r.uri) + '</span>'},
      {cls:'s ' + statusClass(r.status), html: String(r.status)},
      {cls:'n', html: String(r.ms)},
      {cls:'n z', html: bytes(r.size)},
      {cls:'ip', html: esc(r.ip)},
    ])
  );
}

function renderLogs(rows){
  return table(
    [{label:'time (IST)',cls:'t'},{label:'age',cls:'a'},{label:'level',cls:'m'},{label:'source',cls:'u'},{label:'message'}],
    rows.map(r => [
      {cls:'t', html: esc(r.t)},
      {cls:'a', html: esc(r.age)},
      {cls:'m lv-' + esc(r.level), html: esc(r.level)},
      {cls:'u', html: esc(r.logger) || '—'},
      {html: esc(r.msg)},
    ])
  );
}

// Which deploys the reader has expanded, keyed by a stable identity: the list
// is rebuilt on every refresh, so open state has to survive outside the DOM.
const openDeploys = new Set();
const seenDeploys = new Set();
function deployKey(r){ return (r.sha || 'poller') + '@' + r.t; }

// Build blocks currently on screen, by build-log name, so each poll can stream
// more of them without rebuilding the list.
const buildHolders = new Map();

// Load one build log into its block, keeping the reader's position unless they
// were already at the end.
async function loadBuild(name, holder){
  try {
    const res = await fetch(BASE + 'api/tail?file=build&name=' + encodeURIComponent(name), { cache: 'no-store' });
    const body = await res.json();
    const text = (body.rows || []).join('\\n');
    if (holder.dataset.text === text) return;
    const atEnd = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 80;
    holder.dataset.text = text;
    holder.textContent = text || '(no output yet)';
    if (atEnd) scrollEl.scrollTop = scrollEl.scrollHeight;
  } catch {
    holder.textContent = 'build log unavailable';
  }
}

function renderDeploys(rows, build){
  buildHolders.clear();
  const wrap = document.createElement('div');
  wrap.className = 'deploys';
  if (rows.length === 0){
    wrap.innerHTML = '<div class="empty">no deploys yet</div>';
    return wrap;
  }
  for (const r of rows){
    // A running deploy opens itself so the live lines are visible.
    const key = deployKey(r);
    // A deploy that is still building opens itself the first time it appears,
    // then obeys the reader.
    if (r.status === 'running' && !seenDeploys.has(key)){
      seenDeploys.add(key);
      openDeploys.add(key);
    }
    const item = document.createElement('div');
    item.className = 'deploy';
    item.dataset.status = r.status;
    item.dataset.open = openDeploys.has(key) ? 'true' : 'false';

    const row = document.createElement('button');
    row.className = 'row';
    const icon = r.status === 'running' ? '<span class="spinner"></span>'
      : r.status === 'success' ? '<span class="ico-ok">✓</span>'
      : r.status === 'failed' ? '<span class="ico-bad">✕</span>'
      : '<span class="ico-info">•</span>';
    row.innerHTML = icon
      + '<span class="sha' + (r.sha ? '' : ' dim') + '">' + esc(r.sha || 'poller') + '</span>'
      + '<span class="when">' + esc(r.t) + ' IST <span class="ago">· ' + esc(r.age) + ' ago</span></span>'
      + '<span class="dur">' + esc(r.duration || '—') + '</span>'
      + '<span class="caret">▾</span>';
    row.onclick = () => {
      if (openDeploys.has(key)) openDeploys.delete(key);
      else openDeploys.add(key);
      item.dataset.open = openDeploys.has(key) ? 'true' : 'false';
    };
    item.appendChild(row);

    const detail = document.createElement('ol');
    detail.className = 'detail';
    for (const line of r.detail){
      const li = document.createElement('li');
      li.textContent = line;
      detail.appendChild(li);
    }
    // The build output for THIS deploy, loaded lazily so the list stays cheap.
    // A running deploy keeps refreshing it; a finished one loads once.
    if (r.build){
      const heading = document.createElement('li');
      heading.className = 'sub';
      heading.textContent = 'build — ' + r.build;
      detail.appendChild(heading);
      const holder = document.createElement('li');
      holder.className = 'buildline';
      holder.textContent = 'loading…';
      detail.appendChild(holder);
      // Registered so later polls can stream more of it without a rebuild.
      buildHolders.set(r.build, holder);
      loadBuild(r.build, holder);
    }
    item.appendChild(detail);
    wrap.appendChild(item);
  }
  return wrap;
}

function renderText(lines){
  const ol = document.createElement('ol');
  ol.className = 'log';
  lines.forEach((line, i) => {
    const li = document.createElement('li');
    const n = document.createElement('span'); n.className = 'n'; n.textContent = String(i + 1);
    const t = document.createElement('span'); t.className = 't ' + tone(line); t.innerHTML = esc(line) || ' ';
    li.append(n, t);
    ol.appendChild(li);
  });
  return ol;
}

function render(data){
  if (data.kind === 'access') return renderAccess(data.rows);
  if (data.kind === 'log') return renderLogs(data.rows);
  if (data.kind === 'deploys') return renderDeploys(data.rows, data.build ?? []);
  if (data.kind === 'text') return renderText(data.rows);
  return renderText([]);
}

function select(name){
  current = name;
  writePref('file', name);
  titleEl.textContent = name;
  for (const [key, btn] of buttons) btn.setAttribute('aria-current', String(key === name));
  scrollEl.replaceChildren();
  scrollEl.scrollTop = 0;
  load();
}

const BASE = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
let busy = false;
let lastSignature = '';
async function load(manual){
  if (busy) return;
  busy = true;
  if (manual) glyph.classList.add('spin');
  try {
    const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 80;
    const r = await fetch(BASE + 'api/tail?file=' + encodeURIComponent(current) + '&n=${DEFAULT_LINES}', { cache: 'no-store' });
    if (!r.ok){ scrollEl.innerHTML = '<div class="empty">HTTP ' + r.status + '</div>'; return; }
    const data = await r.json();
    if (data.missing){
      scrollEl.innerHTML = '<div class="empty">(no such log yet)</div>';
      metaEl.textContent = '';
      return;
    }
    const noun = data.kind === 'deploys' ? ' deploys' : ' rows';

    // The age field ("3m ago") is recomputed on every request, so including it made
    // every tick look like a change and forced a rebuild — the jumping. It is
    // excluded: only real changes rebuild the list.
    const stable = JSON.stringify({
      kind: data.kind,
      rows: data.rows.map((row) => {
        const copy = { ...row };
        delete copy.age;
        return copy;
      }),
    });

    if (manual || stable !== lastSignature){
      lastSignature = stable;
      const scrollBefore = scrollEl.scrollTop;
      scrollEl.replaceChildren(render(data));
      metaEl.textContent = data.rows.length + noun + ' · ' + new Date().toLocaleTimeString();
      scrollEl.scrollTop = atBottom ? scrollEl.scrollHeight : scrollBefore;
    } else {
      metaEl.textContent = data.rows.length + noun + ' · ' + new Date().toLocaleTimeString();
    }

    // Stream every build block on screen, whether or not the list rebuilt.
    for (const [name, holder] of buildHolders) loadBuild(name, holder);
  } catch {
    metaEl.textContent = 'fetch failed';
  } finally {
    busy = false;
    if (manual) setTimeout(() => glyph.classList.remove('spin'), 300);
  }
}

refreshBtn.onclick = () => load(true);
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) load(true);
});

select(current);

// Live updates: the server pushes "change" when a log file moves. A slow
// fallback timer covers a dropped stream (tunnel restart, laptop wake) until
// EventSource reconnects on its own.
const stream = new EventSource(BASE + 'api/stream');
stream.addEventListener('change', () => load());
setInterval(() => { if (stream.readyState !== 1) load(); }, 30000);
</script>
</body></html>`;

/** Open `text/event-stream` responses waiting to be told something changed. */
const streamClients = new Set();
let broadcastTimer = null;

/**
 * Tell every open stream that the logs moved.
 *
 * Debounced: a build writes hundreds of files in a burst, and each one fires a
 * watcher event. One notification per 250 ms is plenty for a human reader.
 */
function broadcastChange() {
  if (broadcastTimer !== null) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    for (const client of streamClients) {
      client.write("event: change\ndata: {}\n\n");
    }
  }, 250);
}

/** Watch a directory, ignoring anything that makes `fs.watch` unhappy. */
function watchForChanges(dir) {
  try {
    const watcher = fs.watch(dir, { persistent: true }, () => broadcastChange());
    watcher.on("error", () => {});
  } catch {
    // Missing directory: the viewer still works, it just polls instead.
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // Server-sent events: the browser holds this open and re-reads on demand,
  // so there is no polling timer and the log appears as it is written.
  if (url.pathname === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write("retry: 3000\n\n");
    streamClients.add(res);
    req.on("close", () => streamClients.delete(res));
    return;
  }

  // One deploy's build output, addressed by the name the deploy log recorded.
  if (url.pathname === "/api/tail" && url.searchParams.get("file") === "build") {
    const buildName = url.searchParams.get("name") ?? "";
    if (!/^[0-9a-f]{7}-\d+\.log$/.test(buildName)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad build name" }));
      return;
    }
    const buildLines = tailLines(path.join(LOG_DIR, "builds", buildName), 300);
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ kind: "text", rows: buildLines ?? [], missing: buildLines === null }));
    return;
  }

  if (url.pathname === "/api/tail") {
    const name = url.searchParams.get("file") ?? "";
    const file = Object.hasOwn(FILES, name) ? FILES[name] : null;
    if (file === null) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown log" }));
      return;
    }

    const requested = Number(url.searchParams.get("n") ?? DEFAULT_LINES);
    const count = Math.min(
      Math.max(Number.isFinite(requested) ? requested : DEFAULT_LINES, 1),
      MAX_LINES,
    );
    const lines = tailLines(path.join(LOG_DIR, file), count);

    if (lines === null) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ kind: "text", rows: [], missing: true }));
      return;
    }

    // The deploy log is an event stream, not a list of lines: one row per
    // attempt reads far better than the raw text. Read a wide window so a
    // deploy that started before the visible tail is still folded correctly.
    if (file === "autodeploy.log") {
      const history = tailLines(path.join(LOG_DIR, file), MAX_LINES) ?? [];
      // The build's own output is only interesting when a deploy failed, so it
      // rides along with the failed item instead of owning a sidebar entry.
      const build = tailLines(path.join(LOG_DIR, "deploy-build.log"), 120) ?? [];
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify({ kind: "deploys", rows: parseDeploys(history), build }),
      );
      return;
    }

    const classified = lines.map(classify);
    const kind = shapeOf(classified);
    const rows =
      kind === "text" ? classified.map((row) => row.text ?? "") : classified;

    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ kind, rows }));
    return;
  }

  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(PAGE);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[log-viewer] http://127.0.0.1:${String(PORT)} (logs: ${LOG_DIR})`);
  watchForChanges(LOG_DIR);
  watchForChanges(path.join(LOG_DIR, "builds"));
  // Cloudflare drops an idle HTTP connection after ~100 s, so keep the stream
  // warm with a comment line the browser ignores.
  setInterval(() => {
    for (const client of streamClients) client.write(": ping\n\n");
  }, 15_000).unref();
});

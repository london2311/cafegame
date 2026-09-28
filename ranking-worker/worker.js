// カフェ・ルーレット 全国ランキング（Cloudflare Workers + D1）
// 使い方は同じフォルダの README.md を参照。D1 データベースを変数名「DB」で紐付けてください。

// ゲームを公開しているサイト（これ以外からの登録は受け付けない）
const ALLOWED_ORIGINS = ["https://london2311.github.io"];
const TOP_N = 30;
const NAME_MAX = 12;
const POST_INTERVAL_MS = 5000; // 同じ端末からの連続登録の間隔

// 各カテゴリ100項目のテーマ（"-" はテーマなし）。index.html の CATS と同じ並び
const TAGS = [
  "-----------r--m----rrrwwf-iii----w--r-i-a-mmnnsss----------ffiiwwmmrraaa---sskkkk---nnuuuuuuuu---uu-",
  "--------------------rrrrrrrwwwwww---------ffffffiiiiiisssssmmmmnnnaaaawwfir-----kkkkkuuuuuuuu----uu-",
  "-------------------rrrrr----------nnnwwwwfffiiisssmmmaaaa-------------kkkkkk--------uuuuuuuu-----uu-",
  "-------------------rrrr------mmmmmwwwwnnnffiksss---------mmaaaaa--kkkkkwwmsuuuuu-------mmw-uu----uu-",
  "-------------------rrrr-------mmmmmwwwwwsssssffffiiiinnn------aaaaa---kkkkk-----ms--uuuuuuuuuuuuuu--",
  "-------------------rrrrr------mmmmmwwwwwnnnnfffiiisssss---aaaaaauuuukkkkkk----mmswwuuuuuu-------uuu-"
];
const THEME_BONUS = [0, 0, 20, 50, 100, 170, 260];

// ゲーム本体（index.html の evaluate）と同じ計算
function ptsOf(i) { return Math.round(i * 1.2 - 20 + ((i * 37) % 7) - 3); }
function evaluate(ix) {
  const base = ix.reduce((a, i) => a + ptsOf(i), 0);
  let bonus = 0;
  const counts = {};
  ix.forEach((i, c) => { const t = TAGS[c][i]; if (t !== "-") counts[t] = (counts[t] || 0) + 1; });
  Object.values(counts).forEach(n => { if (n >= 2) bonus += THEME_BONUS[n]; });
  const [co, si, se, cl, pl, mo] = ix;
  if (ix.every(i => i >= 80)) bonus += 80;
  if (co >= 70 && si >= 70) bonus += 30;
  if (co >= 90 && ix.slice(1).every(i => i < 35)) bonus += 70;
  if (pl < 10 && co >= 85) bonus += 40;
  if (se >= 85 && co < 20) bonus += 35;
  if (cl >= 85 && mo >= 85) bonus += 30;
  if (pl >= 80 && cl < 20) bonus -= 60;
  if (mo >= 80 && cl < 15) bonus -= 40;
  if (se < 10 && cl < 10) bonus -= 30;
  if (ix.every(i => i < 15)) bonus -= 50;
  if (new Set(ix.map(i => i % 10)).size === 1) bonus += 77;
  const total = base + bonus;
  const p = 1 / (1 + Math.exp(-(total - 250) / 62));
  const rank = Math.max(1, Math.min(100, 100 - Math.floor(p * 100)));
  return { total, rank };
}

// 制御文字・見えない文字・書式制御文字と < > を名前から取り除く
const BAD_CHARS = new RegExp("[" + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]]
  .map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("") + "<>]", "g");
function cleanName(v) {
  if (typeof v !== "string") return "";
  const s = v.normalize("NFKC").replace(BAD_CHARS, "").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, NAME_MAX).join("");
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
const json = (body, headers, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

let ready = false;
async function setup(db) {
  if (ready) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS scores (name TEXT PRIMARY KEY, score INTEGER NOT NULL, rank INTEGER NOT NULL, picks TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS scores_order ON scores (score DESC, created_at ASC)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS hits (id TEXT PRIMARY KEY, at INTEGER NOT NULL)").run();
  ready = true;
}
async function top(db) {
  const r = await db.prepare("SELECT name, score, rank FROM scores ORDER BY score DESC, created_at ASC LIMIT ?").bind(TOP_N).all();
  return r.results || [];
}
async function clientId(req) {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("cafe-roulette:" + ip));
  return Array.from(new Uint8Array(buf).slice(0, 12), b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (url.pathname !== "/scores") return json({ error: "not_found" }, cors, 404);
    if (!env.DB) return json({ error: "db_not_bound" }, cors, 500);
    await setup(env.DB);

    if (req.method === "GET") return json({ top: await top(env.DB) }, cors);

    if (req.method === "POST") {
      const origin = req.headers.get("Origin") || "";
      if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "forbidden" }, cors, 403);
      let body;
      try { body = await req.json(); } catch (e) { return json({ error: "bad_json" }, cors, 400); }
      const name = cleanName(body && body.name);
      const picks = body && body.picks;
      if (!name) return json({ error: "bad_name" }, cors, 400);
      if (!Array.isArray(picks) || picks.length !== 6 || !picks.every(i => Number.isInteger(i) && i >= 0 && i < 100)) return json({ error: "bad_picks" }, cors, 400);

      const now = Date.now();
      const id = await clientId(req);
      const hit = await env.DB.prepare("SELECT at FROM hits WHERE id = ?").bind(id).first();
      if (hit && now - hit.at < POST_INTERVAL_MS) return json({ error: "too_fast" }, cors, 429);
      await env.DB.prepare("INSERT INTO hits (id, at) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at").bind(id, now).run();
      if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM hits WHERE at < ?").bind(now - 86400000).run();

      const { total, rank } = evaluate(picks);
      await env.DB.prepare(
        "INSERT INTO scores (name, score, rank, picks, created_at) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET score = excluded.score, rank = excluded.rank, picks = excluded.picks, created_at = excluded.created_at " +
        "WHERE excluded.score > scores.score"
      ).bind(name, total, rank, JSON.stringify(picks), now).run();
      const best = await env.DB.prepare("SELECT score, created_at FROM scores WHERE name = ?").bind(name).first();
      const pos = await env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE score > ? OR (score = ? AND created_at < ?)").bind(best.score, best.score, best.created_at).first();
      return json({ name, score: total, rank, best: best.score, position: (pos ? pos.n : 0) + 1, top: await top(env.DB) }, cors);
    }
    return json({ error: "method_not_allowed" }, cors, 405);
  }
};

/**
 * MAKMUR GROSIR - IMAGE URL FINDER (STEALTH + PARALLEL)
 * Searches Lazada + Blibli for product image URLs.
 * Uses 3 parallel workers to process 2,781 products in ~2 hours.
 *
 * node scripts/find_image_urls.js --mode=quick   (test 10)
 * node scripts/find_image_urls.js --mode=full    (all 2,781 — parallel)
 * node scripts/find_image_urls.js --mode=resume  (retry failed — parallel)
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const CFG = {
  excel: path.join(__dirname, "..", "Daftar Produk.xlsx"),
  out: path.join(__dirname, "..", "assets", "images"),
  delay: process.env.CI ? 2000 : 1000,
  mode: process.argv.find(a => a.startsWith("--mode="))?.split("=")[1] || "full",
  workers: process.env.CI ? 3 : 2,  // 3 parallel in CI, 2 locally
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Excel ──────────────────────────────────────────────────────────
function readExcel() {
  console.log("📖 Reading Excel...");
  const wb = XLSX.readFile(CFG.excel);
  const ws = wb.Sheets["Sheet"];
  const data = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 });
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const n = (data[i][1] || "").trim();
    if (!n || out.find(x => x.name.toUpperCase() === n.toUpperCase())) continue;
    out.push({ id: out.length + 1, name: n });
  }
  console.log(`✅ ${out.length} products\n`);
  return out;
}

// ── Scoring ────────────────────────────────────────────────────────
function matchScore(productName, altText) {
  const p = productName.toLowerCase(), a = altText.toLowerCase();
  let m = 0;
  p.split(/\s+/).filter(w => w.length > 1).forEach(pw => { if (a.includes(pw)) m++; });
  return m;
}

function cleanUrl(url) {
  return url.replace(/(\.(?:jpg|jpeg|png|webp))[_.].*$/i, "$1");
}

// ── Stealth ────────────────────────────────────────────────────────
async function applyStealth(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, "plugins", {
      get: () => {
        const arr = [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
          { name: "Native Client", filename: "internal-nacl-plugin" },
        ];
        arr.item = i => arr[i];
        arr.namedItem = n => arr.find(p => p.name === n);
        arr.refresh = () => {};
        Object.setPrototypeOf(arr, PluginArray.prototype);
        return arr;
      }
    });
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) =>
      params.name === "notifications"
        ? Promise.resolve({ state: Notification.permission, onchange: null })
        : origQuery(params);
    Object.defineProperty(navigator, "languages", { get: () => ["id-ID", "id", "en-US", "en"] });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  });
}

// ── Lazada ─────────────────────────────────────────────────────────
async function searchLazada(page, productName) {
  const q = encodeURIComponent(productName);
  const url = `https://www.lazada.co.id/catalog/?q=${q}`;

  // Fast: domcontentloaded first, networkidle only on retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: attempt === 0 ? "domcontentloaded" : "networkidle",
        timeout: 15000
      });
      await sleep(attempt === 0 ? 1500 : 2000);
      break;
    } catch (e) {
      if (attempt === 1) return [];
      await sleep(2000);
    }
  }

  // Quick scroll to trigger lazy images
  await page.evaluate(() => window.scrollBy(0, 600));
  await sleep(400);

  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll("img[src*=\"lazcdn.com\"]").forEach(img => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = (img.getAttribute("alt") || "").trim();
      if (!src.includes("/g/p/") && !src.includes("/g/ff/")) return;
      if (!alt || alt.length < 3) return;
      found.push({ url: src, alt });
    });
    return found;
  });

  return results.map(r => ({ ...r, score: matchScore(productName, r.alt) }))
    .sort((a, b) => b.score - a.score);
}

// ── Blibli ─────────────────────────────────────────────────────────
async function searchBlibli(page, productName) {
  const q = encodeURIComponent(productName);
  try {
    await page.goto(`https://www.blibli.com/cari/${q}`, {
      waitUntil: "domcontentloaded", timeout: 15000
    });
  } catch (e) { return []; }

  await sleep(2000);
  await page.evaluate(() => window.scrollBy(0, 800));
  await sleep(600);

  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll("img[src*=\"static-src.com/wcsstore\"]").forEach(img => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = (img.getAttribute("alt") || "").trim();
      if (!alt || alt.length < 3) return;
      if (!src.includes("/catalog/")) return;
      found.push({ url: src, alt });
    });
    return found;
  });

  return results.map(r => ({ ...r, score: matchScore(productName, r.alt) }))
    .sort((a, b) => b.score - a.score);
}

// ── Single product ─────────────────────────────────────────────────
async function findOne(page, product) {
  const { name } = product;

  // 1. Lazada
  let results = [];
  for (let retry = 0; retry < 2 && results.length === 0; retry++) {
    try { results = await searchLazada(page, name); } catch (e) {}
    if (results.length === 0 && retry < 1) await sleep(1500);
  }

  if (results.length > 0) {
    return { url: cleanUrl(results[0].url), source: "lazada", score: results[0].score };
  }

  // 2. Blibli fallback
  await sleep(1000);
  try { results = await searchBlibli(page, name); } catch (e) {}

  if (results.length > 0) {
    return { url: results[0].url, source: "blibli", score: results[0].score };
  }

  return null;
}

// ── Generate JS mapping ────────────────────────────────────────────
function genJs(m) {
  const entries = Object.entries(m).filter(([_, e]) => e.url);
  const lines = [`/** Auto-generated — ${entries.length} product image URLs */`, "const productImages = {"];
  for (const [id, entry] of entries) lines.push(`  "${id}":${JSON.stringify(entry)},`);
  lines.push("};");
  lines.push("function getProductImage(id){const e=productImages[id];return e&&e.url?e.url:null;}");
  lines.push("function getImageStatus(id){const e=productImages[id];return e?e.status:\"missing\";}");
  fs.writeFileSync(path.join(CFG.out, "image-mapping.js"), lines.join("\n") + "\n", "utf-8");
}

// ── Context factory ────────────────────────────────────────────────
async function createContext(browser, ua) {
  const ctx = await browser.newContext({
    locale: "id-ID", timezoneId: "Asia/Jakarta",
    viewport: { width: 1366, height: 768 },
    userAgent: ua,
    extraHTTPHeaders: {
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    }
  });
  const p = await ctx.newPage();
  await applyStealth(p);
  return { ctx, page: p };
}

// ── Parallel worker ────────────────────────────────────────────────
async function worker(browser, workerId, prods, sharedState) {
  const uas = sharedState.userAgents;
  let uaIdx = workerId;
  let { ctx, page } = await createContext(browser, uas[uaIdx % uas.length]);

  let ok = 0, lazOk = 0, bliOk = 0, fail = 0, consec = 0;
  const ROTATE_EVERY = 50;
  let rotations = 0;

  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];

    // Skip already-found
    if (sharedState.m[p.id] && sharedState.m[p.id].url) continue;

    // Periodic rotation
    if (i > 0 && i % ROTATE_EVERY === 0) {
      await ctx.close().catch(() => {});
      uaIdx++;
      ({ ctx, page } = await createContext(browser, uas[uaIdx % uas.length]));
      rotations++;
      await sleep(1000);
    }

    // Rotation on 3 fails
    if (consec >= 3) {
      await ctx.close().catch(() => {});
      uaIdx++;
      ({ ctx, page } = await createContext(browser, uas[uaIdx % uas.length]));
      consec = 0;
      rotations++;
      await sleep(5000);
    }

    process.stdout.write(`\r[W${workerId}] ${i + 1}/${prods.length} | 📦 ${p.name.substring(0, 35)}...`);

    const result = await findOne(page, p);

    // Update shared state
    if (result && result.url) {
      sharedState.m[p.id] = { name: p.name, url: result.url, source: result.source, status: "found" };
      ok++; if (result.source === "lazada") lazOk++; else bliOk++;
      consec = 0;
      sharedState.stats.ok++;
      if (result.source === "lazada") sharedState.stats.lazOk++; else sharedState.stats.bliOk++;
    } else {
      sharedState.m[p.id] = { name: p.name, url: null, status: "failed" };
      sharedState.fl.push({ id: p.id, name: p.name });
      fail++; consec++;
      sharedState.stats.fail++;
    }
    sharedState.stats.done++;

    // Save progress
    if (sharedState.stats.done % 20 === 0 || (result && result.url)) {
      fs.writeFileSync(sharedState.mp, JSON.stringify(sharedState.m, null, 2), "utf-8");
      fs.writeFileSync(sharedState.fp, JSON.stringify(sharedState.fl, null, 2), "utf-8");
    }

    process.stdout.write(`\r[W${workerId}] ${i + 1}/${prods.length} | ✅${ok} ❌${fail} | Total: ${sharedState.stats.done}/${sharedState.total}`);

    if (i < prods.length - 1) {
      await sleep(500 + Math.floor(Math.random() * CFG.delay));
    }
  }

  await ctx.close().catch(() => {});
  return { ok, fail, lazOk, bliOk };
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  🔗 IMAGE URL FINDER — Parallel Stealth ║");
  console.log(`║  Workers: ${CFG.workers}                              ║`);
  console.log("╚══════════════════════════════════════════╝\n");

  const all = readExcel();
  let prods = [...all];
  if (CFG.mode === "quick") prods = prods.slice(0, 10);
  else if (CFG.mode === "resume") {
    const fp = path.join(CFG.out, "_failed.json");
    if (fs.existsSync(fp)) {
      prods = JSON.parse(fs.readFileSync(fp, "utf-8"))
        .map(f => all.find(x => x.id === f.id)).filter(Boolean);
    }
  }
  const total = prods.length;
  console.log(`${CFG.mode === "quick" ? "⚡ Quick: 10" : CFG.mode === "resume" ? "🔄 Resume: " + total : "🔥 Full: " + total}\n`);

  if (!fs.existsSync(CFG.out)) fs.mkdirSync(CFG.out, { recursive: true });

  const mp = path.join(CFG.out, "_mapping.json");
  const fp = path.join(CFG.out, "_failed.json");

  const sharedState = {
    m: fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, "utf-8")) : {},
    fl: fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, "utf-8")) : [],
    stats: { ok: 0, lazOk: 0, bliOk: 0, fail: 0, done: 0 },
    total,
    lock: false,
    mp, fp,
    userAgents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    ],
  };

  // Filter out already-found products
  let remaining = prods.filter(p => !sharedState.m[p.id] || !sharedState.m[p.id].url);
  console.log(`📋 ${remaining.length}/${total} products to process\n`);

  if (remaining.length === 0) {
    console.log("✅ All products already have URLs!");
    genJs(sharedState.m);
    return;
  }

  console.log("🚀 Launching Playwright...");
  const { chromium } = require("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ]
  });

  // Split products among workers
  const workers = Math.min(CFG.workers, remaining.length);
  const chunkSize = Math.ceil(remaining.length / workers);
  const chunks = [];
  for (let w = 0; w < workers; w++) {
    chunks.push(remaining.slice(w * chunkSize, (w + 1) * chunkSize));
  }

  console.log(`⚡ Starting ${workers} parallel workers (${chunks.map(c => c.length).join(", ")} products each)...\n`);

  const startTime = Date.now();
  const results = await Promise.allSettled(
    chunks.map((chunk, idx) => worker(browser, idx, chunk, sharedState))
  );

  await browser.close();

  // Final save
  fs.writeFileSync(mp, JSON.stringify(sharedState.m, null, 2), "utf-8");
  if (sharedState.fl.length > 0) fs.writeFileSync(fp, JSON.stringify(sharedState.fl, null, 2), "utf-8");
  genJs(sharedState.m);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  console.log(`\n\n⏱️  ${mins}m ${secs}s | ✅ ${sharedState.stats.ok} URLs (L:${sharedState.stats.lazOk} B:${sharedState.stats.bliOk}) | ❌ ${sharedState.stats.fail} failed`);
  if (CFG.mode === "quick") console.log(`🔥 Full run: node scripts/find_image_urls.js --mode=full`);
  if (sharedState.fl.length > 0) console.log(`💡 Retry failed: node scripts/find_image_urls.js --mode=resume\n`);
}

main().catch(err => { console.error("\n❌ Fatal:", err); process.exit(1); });

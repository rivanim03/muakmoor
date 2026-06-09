/**
 * MAKMUR GROSIR - IMAGE URL FINDER (BATCH MODE)
 * Processes 50 products per run, designed for scheduled GitHub Actions.
 * Accumulates results across runs via _mapping.json.
 *
 * node scripts/find_image_urls.js --mode=batch   (50 pending products)
 * node scripts/find_image_urls.js --mode=quick   (test 10)
 * node scripts/find_image_urls.js --mode=full    (all — use locally)
 * node scripts/find_image_urls.js --mode=resume  (retry failed)
 */

const fs = require("fs");
const path = require("path");

// Load product list from products-data.js (single source of truth for IDs)
const { products: allProducts } = require(path.join(__dirname, "..", "products-data.js"));

const CFG = {
  out: path.join(__dirname, "..", "assets", "images"),
  delay: process.env.CI ? 3000 : 1000,
  batchSize: 50,
  mode: process.argv.find(a => a.startsWith("--mode="))?.split("=")[1] || "batch",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Product list from products-data.js ────────────────────────────
function getProductList() {
  console.log(`📖 Loading ${allProducts.length} products from products-data.js...`);
  return allProducts.map(p => ({ id: p.id, name: p.name }));
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
    try { window.chrome = { runtime: {} }; } catch(e) {}
    try { Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] }); } catch(e) {}
    try {
      const orig = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (p) =>
        p.name === "notifications" ? Promise.resolve({ state: Notification.permission, onchange: null }) : orig(p);
    } catch(e) {}
    try { Object.defineProperty(navigator, "languages", { get: () => ["id-ID", "id", "en-US", "en"] }); } catch(e) {}
    try { Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 }); } catch(e) {}
    try { Object.defineProperty(navigator, "deviceMemory", { get: () => 8 }); } catch(e) {}
  });
}

// ── Lazada ─────────────────────────────────────────────────────────
async function searchLazada(page, productName) {
  const q = encodeURIComponent(productName);
  for (let a = 0; a < 2; a++) {
    try {
      await page.goto(`https://www.lazada.co.id/catalog/?q=${q}`, {
        waitUntil: a === 0 ? "domcontentloaded" : "networkidle", timeout: 15000
      });
      await sleep(a === 0 ? 1500 : 2000);
      break;
    } catch (e) { if (a === 1) return []; await sleep(2000); }
  }
  await page.evaluate(() => window.scrollBy(0, 600));
  await sleep(600);
  await page.evaluate(() => window.scrollBy(0, 800));
  await sleep(600);
  await page.evaluate(() => window.scrollBy(0, 1000));
  await sleep(400);

  // ── Diagnostics ──
  const diag = await page.evaluate(() => {
    const title = document.title || "";
    const allLazcdnImgs = document.querySelectorAll("img[src*=\"lazcdn.com\"]").length;
    const productCards = document.querySelectorAll("[data-qa-locator=\"product-item\"], .Bm3ON, .RfADt").length;
    const bodyText = (document.body?.innerText || "").substring(0, 200);
    return { title, allLazcdnImgs, productCards, bodyText };
  });

  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll("img[src*=\"lazcdn.com\"]").forEach(img => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = (img.getAttribute("alt") || "").trim();
      if (!src.includes("/g/p/") && !src.includes("/g/ff/") && !src.includes("/g/")) return;
      if (!alt || alt.length < 3) return;
      found.push({ url: src, alt });
    });
    return found;
  });

  // Log diagnostics for debugging
  if (results.length === 0) {
    console.log(`   🔍 Diag: title="${diag.title.substring(0,60)}" | lazcdn imgs:${diag.allLazcdnImgs} | cards:${diag.productCards} | body:"${diag.bodyText.substring(0,80)}"`);
  }

  return results.map(r => ({ ...r, score: matchScore(productName, r.alt) }))
    .sort((a, b) => b.score - a.score);
}

// ── Blibli ─────────────────────────────────────────────────────────
async function searchBlibli(page, productName) {
  const q = encodeURIComponent(productName);
  try { await page.goto(`https://www.blibli.com/cari/${q}`, { waitUntil: "domcontentloaded", timeout: 15000 }); }
  catch (e) { return []; }
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

// ── Shopee ─────────────────────────────────────────────────────────
async function searchShopee(page, productName) {
  const q = encodeURIComponent(productName);
  try { await page.goto(`https://shopee.co.id/search?keyword=${q}`, { waitUntil: "domcontentloaded", timeout: 15000 }); }
  catch (e) { return []; }
  await sleep(2500);
  await page.evaluate(() => window.scrollBy(0, 600));
  await sleep(600);
  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll("img").forEach(img => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = (img.getAttribute("alt") || "").trim();
      if (!alt || alt.length < 3) return;
      if (!src.includes("cf.shopee.co.id/file/") && !src.includes("shopee.co.id")) return;
      if (/icon|logo|banner|avatar/i.test(alt)) return;
      found.push({ url: src, alt });
    });
    return found;
  });
  return results.map(r => ({ ...r, score: matchScore(productName, r.alt) }))
    .sort((a, b) => b.score - a.score);
}

// ── Tokopedia ──────────────────────────────────────────────────────
async function searchTokopedia(page, productName) {
  const q = encodeURIComponent(productName);
  try { await page.goto(`https://www.tokopedia.com/search?q=${q}`, { waitUntil: "domcontentloaded", timeout: 15000 }); }
  catch (e) { return []; }
  await sleep(2500);
  await page.evaluate(() => window.scrollBy(0, 600));
  await sleep(600);
  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll("img").forEach(img => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = (img.getAttribute("alt") || "").trim();
      if (!alt || alt.length < 3) return;
      if (!src.includes("images.tokopedia.net/") && !src.includes("ecs7.tokopedia.net/")) return;
      if (/icon|logo|banner|avatar|topads/i.test(alt)) return;
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

  const sources = [
    { fn: searchLazada,    label: "lazada",    cleanUrl: true },
    { fn: searchBlibli,    label: "blibli",    cleanUrl: false },
    { fn: searchShopee,    label: "shopee",    cleanUrl: false },
    { fn: searchTokopedia, label: "tokopedia", cleanUrl: false },
  ];

  for (const src of sources) {
    let results = [];
    for (let retry = 0; retry < 2 && results.length === 0; retry++) {
      try { results = await src.fn(page, name); } catch (e) {}
      if (results.length === 0 && retry < 1) await sleep(1500);
    }
    if (results.length > 0) {
      const url = src.cleanUrl ? cleanUrl(results[0].url) : results[0].url;
      return { url, source: src.label, score: results[0].score };
    }
    await sleep(1000);
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

// ── Main ───────────────────────────────────────────────────────────
// ── Action log ─────────────────────────────────────────────────────
function appendActionLog(entry) {
  const logPath = path.join(CFG.out, "_action.log");
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(logPath, line, "utf-8");
}

async function main() {
  const all = getProductList();
  const totalAll = all.length;
  const mp = path.join(CFG.out, "_mapping.json");
  const fp = path.join(CFG.out, "_failed.json");
  if (!fs.existsSync(CFG.out)) fs.mkdirSync(CFG.out, { recursive: true });

  let m = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, "utf-8")) : {};
  let fl = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, "utf-8")) : [];

  // Deduplicate failed list (remove duplicate entries with same id)
  const seenIds = new Set();
  fl = fl.filter(f => {
    if (seenIds.has(f.id)) return false;
    seenIds.add(f.id);
    return true;
  });

  const foundCount = Object.values(m).filter(e => e && e.url).length;

  // ── Pick products ──
  let prods;
  if (CFG.mode === "quick") {
    prods = all.slice(0, 10);
  } else if (CFG.mode === "resume") {
    prods = fl.map(f => all.find(x => x.id === f.id)).filter(Boolean);
  } else if (CFG.mode === "full") {
    prods = [...all];
  } else {
    // batch mode: next N pending products
    const pending = all.filter(p => !m[p.id] || !m[p.id].url);
    prods = pending.slice(0, CFG.batchSize);
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log(`║  🔗 BATCH IMAGE FINDER — Lazada+Blibli  ║`);
  console.log(`║  Mode: ${CFG.mode.padEnd(33)}║`);
  console.log(`║  Total catalog: ${String(totalAll).padEnd(24)}║`);
  console.log(`║  Already found: ${String(foundCount).padEnd(24)}║`);
  console.log(`║  This batch: ${String(prods.length).padEnd(28)}║`);
  console.log("╚══════════════════════════════════════════╝\n");

  if (prods.length === 0) {
    console.log("✅ All products have URLs — nothing to do!");
    genJs(m);
    return;
  }

  // ── Browser ──
  console.log("🚀 Launching browser...");
  const { chromium, firefox } = require("playwright");
  let browser, browserType;

  // Try real Chrome with xvfb (non-headless = undetectable)
  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: !process.env.CI,  // headed in CI (xvfb), headless locally
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1366,768",
      ],
      ignoreDefaultArgs: ["--enable-automation"],
    });
    browserType = "chrome";
    console.log(`✅ Google Chrome (${process.env.CI ? "headed+xvfb" : "headless"})`);
  } catch (e) {
    // Fallback: Firefox
    try {
      browser = await firefox.launch({ headless: true });
      browserType = "firefox";
      console.log("⚠️  Firefox (Chrome not available)");
    } catch (e2) {
      // Last resort: Playwright Chromium
      browser = await chromium.launch({
        headless: !process.env.CI,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
               "--disable-blink-features=AutomationControlled",
               "--disable-features=IsolateOrigins,site-per-process",
               "--window-size=1366,768"],
        ignoreDefaultArgs: ["--enable-automation"],
      });
      browserType = "chromium";
      console.log("❌ Playwright Chromium (Chrome & Firefox unavailable)");
    }
  }

  const ctx = await browser.newContext({
    locale: "id-ID", timezoneId: "Asia/Jakarta",
    viewport: { width: 1366, height: 768 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    }
  });
  const page = await ctx.newPage();
  await applyStealth(page);
  console.log("✅ Ready!\n");

  // ── Process ──
  const startTime = Date.now();
  let ok = 0, fail = 0;
  const bySource = {};

  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    console.log(`📦 [${p.id}] ${p.name}`);

    const result = await findOne(page, p);

    if (result && result.url) {
      m[p.id] = { name: p.name, url: result.url, source: result.source, status: "found" };
      ok++; bySource[result.source] = (bySource[result.source] || 0) + 1;
      console.log(`   ✅ ${result.source}: ${result.url.substring(0, 80)}...`);
    } else {
      m[p.id] = { name: p.name, url: null, status: "failed" };
      // Only push to failed list if not already there (dedup)
      if (!fl.some(f => f.id === p.id)) {
        fl.push({ id: p.id, name: p.name });
      }
      fail++;
      console.log(`   ❌ Not found`);
      // Screenshot on first failure for diagnostics
      if (fail === 1) {
        const shotPath = path.join(CFG.out, "_debug_screenshot.png");
        try { await page.screenshot({ path: shotPath, fullPage: false }); console.log(`   📸 Screenshot saved: ${shotPath}`); } catch(e) {}
      }
    }

    // Save after every product in batch mode (safety)
    fs.writeFileSync(mp, JSON.stringify(m, null, 2), "utf-8");
    if (fl.length > 0) fs.writeFileSync(fp, JSON.stringify(fl, null, 2), "utf-8");

    if (i < prods.length - 1) {
      const jitter = 1000 + Math.floor(Math.random() * CFG.delay);
      await sleep(jitter);
    }
  }

  await browser.close();
  genJs(m);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const breakdown = Object.entries(bySource).map(([k,v]) => `${k}:${v}`).join(" ");
  console.log(`\n⏱️  ${Math.floor(elapsed / 60)}m ${elapsed % 60}s | ✅ ${ok} (${breakdown}) | ❌ ${fail}`);
  console.log(`📊 Progress: ${foundCount + ok}/${totalAll} (${((foundCount + ok) / totalAll * 100).toFixed(1)}%)`);
  if (CFG.mode === "batch" && prods.length === CFG.batchSize) {
    console.log(`⏰ Next batch will continue from product #${foundCount + ok + 1}`);
  }

  // ── Action log ──
  appendActionLog({
    timestamp: new Date().toISOString(),
    mode: CFG.mode,
    attempted: prods.length,
    succeeded: ok,
    failed: fail,
    sources: bySource,
    totalProgress: foundCount + ok,
    totalProducts: totalAll,
  });
}

main().catch(err => { console.error("\n❌ Fatal:", err); process.exit(1); });
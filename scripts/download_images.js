/**
 * ============================================================
 * MAKMUR GROSIR - PRODUCT IMAGE DOWNLOADER
 * ============================================================
 * Strategy: Lazada (primary) -> Shopee -> Tokopedia -> Bing
 * Lazada has real product photos indexed from Indonesian sellers.
 *
 * npm run download:test   (10 products)
 * npm run download:all    (all 2,781)
 * npm run download:resume (retry failed)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const XLSX = require('xlsx');

const CFG = {
  excel: path.join(__dirname, '..', 'Daftar Produk.xlsx'),
  out: path.join(__dirname, '..', 'assets', 'images'),
  delay: 2000,
  timeout: 25000,
  mode: process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'full',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const san = n => n.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').substring(0,80);
const fname = (id,n) => `${id}_${san(n)}.jpg`;

// ===== DOWNLOAD FILE =====
function dl(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const t = setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, CFG.timeout);
    const h = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/webp,image/*,*/*;q=0.8',
      'Referer': 'https://www.lazada.co.id/'
    };
    const req = proto.get(url, { headers: h }, (res) => {
      let r = 0;
      const go = (resp) => {
        if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
          if (r++ > 3) { clearTimeout(t); reject(new Error('Redirects')); return; }
          const u = resp.headers.location.startsWith('http') ? resp.headers.location : new URL(resp.headers.location, url).href;
          const p = (u.startsWith('https') ? https : http).get(u, { headers: h }, go);
          p.on('error', e => { clearTimeout(t); reject(e); }); p.end(); return;
        }
        if (resp.statusCode !== 200) { clearTimeout(t); reject(new Error(`HTTP ${resp.statusCode}`)); return; }
        const ct = resp.headers['content-type'] || '';
        if (!ct.startsWith('image/')) { clearTimeout(t); reject(new Error('Not image')); return; }
        const f = fs.createWriteStream(dest);
        resp.pipe(f);
        f.on('finish', () => {
          clearTimeout(t); f.close();
          if (fs.statSync(dest).size < 500) { fs.unlinkSync(dest); reject(new Error('Small')); }
          else resolve(dest);
        });
        f.on('error', e => { clearTimeout(t); try { fs.unlinkSync(dest); } catch(x) {} reject(e); });
      };
      go(res);
    });
    req.on('error', e => { clearTimeout(t); reject(e); }); req.end();
  });
}

// ===== READ EXCEL =====
function readExcel() {
  console.log('📖 Reading Excel...');
  const wb = XLSX.readFile(CFG.excel);
  const ws = wb.Sheets['Sheet'];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const n = (data[i][1] || '').trim();
    if (!n || out.find(x => x.name.toUpperCase() === n.toUpperCase())) continue;
    out.push({ id: out.length + 1, name: n });
  }
  console.log(`✅ ${out.length} products\n`);
  return out;
}

// ===== MATCH SCORE: how well does image alt text match product name? =====
function matchScore(productName, altText) {
  const p = productName.toLowerCase();
  const a = altText.toLowerCase();
  // Count matching words
  const pWords = p.split(/\s+/).filter(w => w.length > 1);
  const aWords = a.split(/\s+/).filter(w => w.length > 1);
  let matches = 0;
  for (const pw of pWords) {
    if (a.includes(pw)) matches++;
  }
  return matches;
}

// ===== LAZADA SEARCH =====
async function searchLazada(page, productName) {
  console.log(`   🛍️  Lazada...`);
  const q = encodeURIComponent(productName);
  try {
    await page.goto(`https://www.lazada.co.id/catalog/?q=${q}`, {
      waitUntil: 'networkidle', timeout: 20000
    });
  } catch (e) {
    await page.goto(`https://www.lazada.co.id/catalog/?q=${q}`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    }).catch(() => {});
  }
  await sleep(4000);

  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll('img[src*="http"]').forEach(img => {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || '').trim();
      // Only product photos: lazcdn.com/g/p/ (not /tps/ or /domino/ UI elements)
      if (src.includes('lazcdn.com/g/p/') && alt && alt.length > 5) {
        found.push({
          src: src.replace(/_\d+x\d+q\d+/, ''),  // strip size suffix for full res
          alt: alt,
        });
      }
    });
    return found;
  });

  if (results.length > 0) {
    // Score by alt text match
    results.forEach(r => { r.score = matchScore(productName, r.alt); });
    results.sort((a, b) => b.score - a.score);
  }

  return results;
}

// ===== TOKOPEDIA SEARCH =====
async function searchTokopedia(page, productName) {
  console.log(`   🛒 Tokopedia...`);
  const q = encodeURIComponent(productName);
  try {
    await page.goto(`https://www.tokopedia.com/search?q=${q}`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await sleep(4000);

    return await page.evaluate(() => {
      const found = [];
      document.querySelectorAll('img[src*="tokopedia"], img[src*="tkpcdn"]').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src && src.startsWith('http') && src.match(/\.(jpg|jpeg|png|webp)/i)) {
          found.push({ src: src, alt: img.getAttribute('alt') || '', score: 0 });
        }
      });
      return found;
    });
  } catch (e) { return []; }
}

// ===== BING FALLBACK =====
async function searchBing(page, productName) {
  console.log(`   🔍 Bing (fallback)...`);
  const q = encodeURIComponent(productName + ' lazada');
  try {
    await page.goto(`https://www.bing.com/images/search?q=${q}`, {
      waitUntil: 'domcontentloaded', timeout: 15000
    });
    await sleep(2000);
    // Cookie
    try {
      const btn = page.locator('#bnp_btn_accept, button[name="accept"]').first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) { await btn.click(); await sleep(300); }
    } catch(e) {}

    await page.evaluate(() => window.scrollBy(0, 400));
    await sleep(500);

    return await page.evaluate(() => {
      const found = [];
      document.querySelectorAll('a.iusc').forEach(a => {
        const m = a.getAttribute('m');
        if (m) {
          try {
            const d = JSON.parse(m);
            if (d.murl && d.murl.match(/\.(jpg|jpeg|png|webp)/i)) {
              // Filter out obvious junk
              const url = d.murl;
              if (!/clipart|painting|illust|wallpaper|logo|icon|vector/i.test(url)) {
                found.push({ src: url, alt: d.t || '', score: 0 });
              }
            }
          } catch(e) {}
        }
      });
      return found.slice(0, 5);
    });
  } catch (e) { return []; }
}

// ===== DOWNLOAD ONE PRODUCT =====
async function downloadOne(page, product) {
  const { id, name } = product;
  const fp = path.join(CFG.out, fname(id, name));
  if (fs.existsSync(fp)) return { status: 'exists' };

  console.log(`\n📦 [${id}] ${name}`);

  let candidates = [];

  // Priority 1: Lazada (best source - real product images)
  try { candidates = await searchLazada(page, name); } catch(e) {}
  console.log(`   Found ${candidates.length} Lazada matches`);

  // Priority 2: Tokopedia
  if (candidates.length === 0) {
    try { candidates = await searchTokopedia(page, name); } catch(e) {}
    console.log(`   Found ${candidates.length} Tokopedia matches`);
  }

  // Priority 3: Bing
  if (candidates.length === 0) {
    try { candidates = await searchBing(page, name); } catch(e) {}
    console.log(`   Found ${candidates.length} Bing matches`);
  }

  if (candidates.length === 0) {
    console.log(`   ❌ No results`);
    return { status: 'failed' };
  }

  // Try each candidate
  for (let i = 0; i < Math.min(candidates.length, 5); i++) {
    const c = candidates[i];
    console.log(`   ⬇️ [${i+1}] ${c.src.substring(0, 80)}...`);
    try {
      await dl(c.src, fp);
      console.log(`   ✅ SAVED!`);
      return { status: 'downloaded', file: fp };
    } catch(e) {
      // Try stripping size suffix for bigger image
      const clean = c.src.split('?')[0];
      if (clean !== c.src) {
        try { await dl(clean, fp); console.log(`   ✅ SAVED!`); return { status: 'downloaded', file: fp }; } catch(x) {}
      }
    }
  }
  console.log(`   ❌ All failed`);
  return { status: 'failed' };
}

// ===== GENERATE image-mapping.js =====
function genJs(m) {
  fs.writeFileSync(path.join(CFG.out, 'image-mapping.js'),
    `const productImages=${JSON.stringify(m, null, 2)};
function getProductImage(id){const e=productImages[id];return e&&e.file?e.file:null;}
function getImageStatus(id){const e=productImages[id];return e?e.status:'missing';}`, 'utf-8');
}

// ===== MAIN =====
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🌐 IMAGE DOWNLOADER — Lazada First  ║');
  console.log('╚════════════════════════════════════════╝\n');

  const all = readExcel();
  let prods = [...all];
  if (CFG.mode === 'quick') prods = prods.slice(0, 10);
  else if (CFG.mode === 'resume') {
    const p = path.join(CFG.out, '_failed.json');
    if (fs.existsSync(p)) prods = JSON.parse(fs.readFileSync(p, 'utf-8')).map(f => all.find(x => x.id === f.id)).filter(Boolean);
  }
  console.log(`${CFG.mode === 'quick' ? '⚡ Quick: 10' : CFG.mode === 'resume' ? '🔄 Resume: ' + prods.length : '🔥 Full: ' + prods.length}\n`);

  if (!fs.existsSync(CFG.out)) fs.mkdirSync(CFG.out, { recursive: true });

  const mp = path.join(CFG.out, '_mapping.json');
  let m = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, 'utf-8')) : {};
  const fp = path.join(CFG.out, '_failed.json');
  let fl = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : [];

  console.log('🚀 Launching Playwright...');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ locale: 'id-ID', viewport: { width: 1280, height: 900 } })).newPage();
  console.log('✅ Ready!\n');

  let ok = 0, fail = 0;
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    if (m[p.id] && m[p.id].file) {
      process.stdout.write(`\r⏭️  ${i+1}/${prods.length} ${p.name}`);
      continue;
    }
    const r = await downloadOne(page, p);
    if (r.status === 'downloaded') {
      m[p.id] = { name: p.name, file: `assets/images/${fname(p.id, p.name)}`, status: 'downloaded' };
      ok++;
    } else {
      fail++;
      fl.push({ id: p.id, name: p.name });
      m[p.id] = { name: p.name, file: null, status: 'failed' };
    }
    process.stdout.write(`\r📊 ${i+1}/${prods.length} | ✅ ${ok} | ❌ ${fail}`);
    if (i < prods.length - 1) await sleep(CFG.delay);
  }

  await browser.close();
  fs.writeFileSync(mp, JSON.stringify(m, null, 2), 'utf-8');
  if (fail > 0) fs.writeFileSync(fp, JSON.stringify(fl, null, 2), 'utf-8');
  genJs(m);
  console.log(`\n\n✅ ${ok} done | ❌ ${fail} failed`);
  if (CFG.mode === 'quick') console.log(`\n🔥 Full: node scripts/download_images.js --mode=full`);
  if (fail > 0) console.log(`💡 Retry: node scripts/download_images.js --mode=resume\n`);
}

main().catch(err => { console.error('\n❌ Fatal:', err); process.exit(1); });

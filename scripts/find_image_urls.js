/**
 * MAKMUR GROSIR - IMAGE URL FINDER
 * Searches Lazada/Bing for product image URLs — saves URLs only,
 * no downloading. App loads images directly from external CDNs.
 *
 * node scripts/find_image_urls.js --mode=quick   (test 10)
 * node scripts/find_image_urls.js --mode=full    (all 2,781)
 * node scripts/find_image_urls.js --mode=resume  (retry)
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const CFG = {
  excel: path.join(__dirname, '..', 'Daftar Produk.xlsx'),
  out: path.join(__dirname, '..', 'assets', 'images'),
  delay: 2000,
  mode: process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'full',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

function matchScore(productName, altText) {
  const p = productName.toLowerCase(), a = altText.toLowerCase();
  let m = 0;
  p.split(/\s+/).filter(w => w.length > 1).forEach(pw => { if (a.includes(pw)) m++; });
  return m;
}

async function searchLazada(page, productName) {
  const q = encodeURIComponent(productName);
  try {
    await page.goto(`https://www.lazada.co.id/catalog/?q=${q}`, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (e) {
    await page.goto(`https://www.lazada.co.id/catalog/?q=${q}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  }
  await sleep(4000);

  const results = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll('img[src*="http"]').forEach(img => {
      const src = img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || '').trim();
      if (src.includes('lazcdn.com/g/p/') && alt && alt.length > 5) {
        found.push({ url: src.replace(/(\.(?:jpg|jpeg|png|webp))[_.].*$/i, '$1'), alt });
      }
    });
    return found;
  });

  return results.map(r => ({ ...r, score: matchScore(productName, r.alt) }))
    .sort((a, b) => b.score - a.score);
}

async function searchBing(page, productName) {
  const q = encodeURIComponent(productName + ' lazada');
  try {
    await page.goto(`https://www.bing.com/images/search?q=${q}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
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
            if (d.murl && d.murl.match(/\.(jpg|jpeg|png|webp)/i) && !/clipart|painting|illust|wallpaper|logo|icon|vector/i.test(d.murl)) {
              found.push({ url: d.murl, alt: d.t || '', score: 0 });
            }
          } catch(e) {}
        }
      });
      return found.slice(0, 5);
    });
  } catch (e) { return []; }
}

async function findOne(page, product) {
  const { id, name } = product;
  console.log(`\n📦 [${id}] ${name}`);

  let candidates = [];
  try { candidates = await searchLazada(page, name); } catch(e) {}
  console.log(`   Lazada: ${candidates.length}`);

  if (candidates.length === 0) {
    try { candidates = await searchBing(page, name); } catch(e) {}
    console.log(`   Bing: ${candidates.length}`);
  }

  if (candidates.length === 0) { console.log(`   ❌ None`); return null; }

  const best = candidates[0];
  console.log(`   ✅ ${best.url.substring(0, 90)}...`);
  return best.url;
}

function genJs(m) {
  const entries = Object.entries(m).filter(([_, e]) => e.url);
  const lines = [`/** Auto-generated — ${entries.length} product image URLs */`, 'const productImages = {'];
  for (const [id, entry] of entries) lines.push(`  "${id}":${JSON.stringify(entry)},`);
  lines.push('};');
  lines.push('function getProductImage(id){const e=productImages[id];return e&&e.url?e.url:null;}');
  lines.push('function getImageStatus(id){const e=productImages[id];return e?e.status:"missing";}');
  fs.writeFileSync(path.join(CFG.out, 'image-mapping.js'), lines.join('\n') + '\n', 'utf-8');
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🔗 IMAGE URL FINDER — Lazada First  ║');
  console.log('╚════════════════════════════════════════╝\n');

  const all = readExcel();
  let prods = [...all];
  if (CFG.mode === 'quick') prods = prods.slice(0, 10);
  else if (CFG.mode === 'resume') {
    const fp = path.join(CFG.out, '_failed.json');
    if (fs.existsSync(fp)) prods = JSON.parse(fs.readFileSync(fp, 'utf-8')).map(f => all.find(x => x.id === f.id)).filter(Boolean);
  }
  console.log(`${CFG.mode === 'quick' ? '⚡ Quick: 10' : CFG.mode === 'resume' ? '🔄 Resume: ' + prods.length : '🔥 Full: ' + prods.length}\n`);

  if (!fs.existsSync(CFG.out)) fs.mkdirSync(CFG.out, { recursive: true });

  const mp = path.join(CFG.out, '_mapping.json');
  let m = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, 'utf-8')) : {};
  const fPath = path.join(CFG.out, '_failed.json');
  let fl = fs.existsSync(fPath) ? JSON.parse(fs.readFileSync(fPath, 'utf-8')) : [];

  console.log('🚀 Launching Playwright...');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ locale: 'id-ID', viewport: { width: 1280, height: 900 } })).newPage();
  console.log('✅ Ready!\n');

  let ok = 0, fail = 0;
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    if (m[p.id] && m[p.id].url) { process.stdout.write(`\r⏭️  ${i+1}/${prods.length} ${p.name}`); continue; }
    const url = await findOne(page, p);
    if (url) { m[p.id] = { name: p.name, url, status: 'found' }; ok++; }
    else { fail++; fl.push({ id: p.id, name: p.name }); m[p.id] = { name: p.name, url: null, status: 'failed' }; }
    process.stdout.write(`\r📊 ${i+1}/${prods.length} | ✅ ${ok} | ❌ ${fail}`);
    if (i < prods.length - 1) await sleep(CFG.delay);
  }

  await browser.close();
  fs.writeFileSync(mp, JSON.stringify(m, null, 2), 'utf-8');
  if (fail > 0) fs.writeFileSync(fPath, JSON.stringify(fl, null, 2), 'utf-8');
  genJs(m);
  console.log(`\n\n✅ ${ok} URLs | ❌ ${fail} failed`);
  if (CFG.mode === 'quick') console.log(`\n🔥 Full: node scripts/find_image_urls.js --mode=full`);
  if (fail > 0) console.log(`💡 Retry: node scripts/find_image_urls.js --mode=resume\n`);
}

main().catch(err => { console.error('\n❌ Fatal:', err); process.exit(1); });

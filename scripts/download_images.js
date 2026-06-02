/**
 * ============================================================
 * MAKMUR GROSIR - PRODUCT IMAGE DOWNLOADER
 * ============================================================
 * Mencari gambar ASLI produk dari internet via Bing Images
 * menggunakan Playwright.
 * 
 * CARA PAKAI:
 *   node scripts/download_images.js --mode=quick    (test 10)
 *   node scripts/download_images.js --mode=full     (semua)
 *   node scripts/download_images.js --mode=resume   (ulang gagal)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const XLSX = require('xlsx');

const CONFIG = {
  excelPath: path.join(__dirname, '..', 'Daftar Produk.xlsx'),
  outputDir: path.join(__dirname, '..', 'assets', 'images'),
  delayBetweenDownloads: 2000,
  downloadTimeout: 30000,
  mode: process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'full',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sanitize = name => name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 80);
const getFilename = (id, name) => `${id}_${sanitize(name)}.jpg`;

// ===== DOWNLOAD FILE =====
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => { req.destroy(); reject(new Error('Timeout')); }, CONFIG.downloadTimeout);
    const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    'Referer': 'https://www.bing.com/'
  };
  const req = protocol.get(url, { headers }, (res) => {
    let redirects = 0;
    const handle = (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirects++ > 3) { clearTimeout(timeout); reject(new Error('Too many redirects')); return; }
        const u = response.headers.location.startsWith('http') ? response.headers.location : new URL(response.headers.location, url).href;
        const proto = u.startsWith('https') ? https : http;
        const r = proto.get(u, { headers }, handle);
        r.on('error', e => { clearTimeout(timeout); reject(e); }); r.end();
        return;
      }
      if (response.statusCode !== 200) { clearTimeout(timeout); reject(new Error(`HTTP ${response.statusCode}`)); return; }
      const ct = response.headers['content-type'] || '';
      if (!ct.startsWith('image/')) { clearTimeout(timeout); reject(new Error(`Not image: ${ct}`)); return; }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        clearTimeout(timeout); file.close();
        const stats = fs.statSync(destPath);
        if (stats.size < 200) { fs.unlinkSync(destPath); reject(new Error(`Too small: ${stats.size}b`)); }
        else resolve(destPath);
      });
      file.on('error', err => { clearTimeout(timeout); try { fs.unlinkSync(destPath); } catch(e){} reject(err); });
    };
    handle(res);
  });
    req.on('error', err => { clearTimeout(timeout); reject(err); });
    req.end();
  });
}

// ===== BACA EXCEL =====
function readProducts() {
  console.log('📖 Membaca file Excel...');
  const wb = XLSX.readFile(CONFIG.excelPath);
  const ws = wb.Sheets['Sheet'];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
  const products = [];
  for (let i = 1; i < data.length; i++) {
    const name = (data[i][1] || '').trim();
    if (!name) continue;
    if (!products.find(p => p.name.toUpperCase() === name.toUpperCase())) {
      products.push({ id: products.length + 1, name });
    }
  }
  console.log(`✅ ${products.length} produk ditemukan\n`);
  return products;
}

// ===== BING IMAGES SEARCH =====
async function findImageOnBing(page, productName) {
  const query = encodeURIComponent(productName);
  console.log(`   🔍 Bing: "${productName}"`);

  await page.goto(`https://www.bing.com/images/search?q=${query}`, {
    waitUntil: 'domcontentloaded', timeout: 25000
  }).catch(() => {});
  await sleep(3000);

  // Accept cookies
  try {
    const btn = page.locator('#bnp_btn_accept, button[name="accept"]').first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) { await btn.click(); await sleep(1000); }
  } catch(e) {}

  // Scroll
  await page.evaluate(() => window.scrollBy(0, 500));
  await sleep(1000);

  // Extract image URLs from the page
  const results = await page.evaluate(() => {
    const urls = [];
    // Bing puts image data in "m" attribute (JSON) of anchor tags
    document.querySelectorAll('a.iusc, a[href*="/images/search"]').forEach(a => {
      const m = a.getAttribute('m');
      if (m) {
        try {
          const data = JSON.parse(m);
          if (data.murl) urls.push(data.murl);
        } catch(e) {}
      }
    });
    // Also check img tags directly
    if (urls.length === 0) {
      document.querySelectorAll('img.mimg, img[src*="http"]').forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('http') && !src.includes('bing.com') && src.match(/\.(jpg|jpeg|png|webp)/i)) {
          urls.push(src);
        }
      });
    }
    return urls;
  });

  return results.length > 0 ? results[0] : null;
}

// ===== DUCKDUCKGO SEARCH =====
async function findImageOnDDG(page, productName) {
  const query = encodeURIComponent(productName);
  console.log(`   🔍 DDG: "${productName}"`);

  await page.goto(`https://duckduckgo.com/?q=${query}&iax=images&ia=images`, {
    waitUntil: 'domcontentloaded', timeout: 20000
  }).catch(() => {});
  await sleep(3000);

  return await page.evaluate(() => {
    const links = document.querySelectorAll('a[data-gid] img, .tile--img img, img[src*="http"]');
    for (const img of links) {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src && src.startsWith('http') && !src.includes('duckduckgo.com') && src.match(/\.(jpg|jpeg|png|webp)/i)) return src;
    }
    return null;
  });
}

// ===== DOWNLOAD 1 PRODUK =====
async function downloadOneProduct(page, product) {
  const { id, name } = product;
  const filePath = path.join(CONFIG.outputDir, getFilename(id, name));
  if (fs.existsSync(filePath)) return { status: 'exists' };

  console.log(`\n📦 [${id}] ${name}`);

  let imgUrl = null;
  try { imgUrl = await findImageOnBing(page, name); } catch(e) { console.log(`   ⚠️ ${e.message}`); }
  if (!imgUrl) { try { imgUrl = await findImageOnDDG(page, name); } catch(e) {} }

  if (imgUrl) {
    console.log(`   ⬇️ ${imgUrl.substring(0, 90)}...`);
    try { await downloadFile(imgUrl, filePath); console.log(`   ✅ BERHASIL!`); return { status: 'downloaded', file: filePath }; }
    catch(err) {
      console.log(`   ❌ ${err.message}`);
      const clean = imgUrl.split('?')[0];
      if (clean !== imgUrl) { try { await downloadFile(clean, filePath); console.log(`   ✅ BERHASIL!`); return { status: 'downloaded', file: filePath }; } catch(e) {} }
    }
  } else console.log(`   ❌ Tidak ada`);

  return { status: 'failed' };
}

// ===== GENERATE image-mapping.js =====
function generateJs(mapping) {
  fs.writeFileSync(path.join(CONFIG.outputDir, 'image-mapping.js'),
    `const productImages = ${JSON.stringify(mapping, null, 2)};
function getProductImage(id) { const e = productImages[id]; return e && e.file ? e.file : null; }
function getImageStatus(id) { const e = productImages[id]; return e ? e.status : 'missing'; }`, 'utf-8');
}

// ===== MAIN =====
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🌐 MAKMUR GROSIR - IMAGE DOWNLOADER          ║');
  console.log('║   (Playwright + Bing Images)                   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const allProducts = readProducts();
  let products = [...allProducts];
  if (CONFIG.mode === 'quick') products = products.slice(0, 10);
  else if (CONFIG.mode === 'resume') {
    const p = path.join(CONFIG.outputDir, '_failed.json');
    if (fs.existsSync(p)) products = JSON.parse(fs.readFileSync(p, 'utf-8')).map(f => allProducts.find(x => x.id === f.id)).filter(Boolean);
  }
  console.log(`${CONFIG.mode === 'quick' ? '⚡ Quick: 10 produk' : CONFIG.mode === 'resume' ? '🔄 Resume: '+products.length : '🔥 Full: '+products.length+' produk'}\n`);

  if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const mappingPath = path.join(CONFIG.outputDir, '_mapping.json');
  let mapping = fs.existsSync(mappingPath) ? JSON.parse(fs.readFileSync(mappingPath, 'utf-8')) : {};
  const failedPath = path.join(CONFIG.outputDir, '_failed.json');
  let failedList = fs.existsSync(failedPath) ? JSON.parse(fs.readFileSync(failedPath, 'utf-8')) : [];

  console.log('🚀 Launching Playwright...');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ locale: 'id-ID', viewport: { width: 1280, height: 900 } })).newPage();
  console.log('✅ Ready!\n');

  let ok = 0, fail = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (mapping[p.id] && mapping[p.id].file) { process.stdout.write(`\r⏭️  ${i+1}/${products.length}`); continue; }
    const r = await downloadOneProduct(page, p);
    if (r.status === 'downloaded') { mapping[p.id] = { name: p.name, file: `assets/images/${getFilename(p.id, p.name)}`, status: 'downloaded' }; ok++; }
    else { fail++; failedList.push({ id: p.id, name: p.name }); mapping[p.id] = { name: p.name, file: null, status: 'failed' }; }
    process.stdout.write(`\r📊 ${i+1}/${products.length} | ✅ ${ok} | ❌ ${fail}`);
    if (i < products.length - 1) await sleep(CONFIG.delayBetweenDownloads);
  }

  await browser.close();
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf-8');
  if (fail > 0) fs.writeFileSync(failedPath, JSON.stringify(failedList, null, 2), 'utf-8');
  generateJs(mapping);

  console.log(`\n\n✅ ${ok} berhasil, ❌ ${fail} gagal`);
  if (CONFIG.mode === 'quick') console.log(`\n🔥 Full: node scripts/download_images.js --mode=full`);
  if (fail > 0) console.log(`💡 Resume: node scripts/download_images.js --mode=resume`);
  console.log();
}

main().catch(err => { console.error('\n❌ Fatal:', err); process.exit(1); });

/**
 * Image Mapping — stub file.
 * Run "Download Gambar Produk.bat" to populate with actual product images.
 * The app uses emoji icons as fallback when no images exist.
 */

const productImages = {};

function getProductImage(productId) {
  const entry = productImages[productId];
  return entry && entry.file ? entry.file : null;
}

function getImageStatus(productId) {
  const entry = productImages[productId];
  return entry ? entry.status : 'missing';
}

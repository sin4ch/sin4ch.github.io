const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'gallery', 'gallery.json');
const THUMBS_DIR = path.join(ROOT, 'gallery', 'thumbs');
// Uncropped, 160px tall: the lightbox strip shows them 52 CSS px tall
// at up to 3x density, with widths following each photo's shape.
const THUMB_HEIGHT = 160;
const THUMB_QUALITY = 60;

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  fs.mkdirSync(THUMBS_DIR, { recursive: true });

  for (const image of manifest.images) {
    const source = path.join(ROOT, image.url.replace(/^\//, ''));
    const target = path.join(THUMBS_DIR, path.basename(image.url));
    execFileSync('magick', [
      source,
      '-auto-orient',
      '-resize', `x${THUMB_HEIGHT}`,
      '-strip',
      '-quality', String(THUMB_QUALITY),
      target
    ]);
  }

  console.log(`Generated ${manifest.images.length} gallery thumbnails in gallery/thumbs/.`);
}

if (require.main === module) main();

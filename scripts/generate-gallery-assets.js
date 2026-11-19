const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'gallery', 'gallery.json');
const THUMBS_DIR = path.join(ROOT, 'gallery', 'thumbs');
const PREVIEW_WIDTH = 64;
const PREVIEW_QUALITY = 55;
const THUMB_HEIGHT = 160;
const THUMB_QUALITY = 60;

function magick(source, resize, quality, output, extra = []) {
  return execFileSync('magick', [source, '-auto-orient', '-resize', resize, ...extra, '-quality', String(quality), output]);
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  fs.mkdirSync(THUMBS_DIR, { recursive: true });

  manifest.images = manifest.images.map(image => {
    const source = path.join(ROOT, image.url.replace(/^\//, ''));
    magick(source, `x${THUMB_HEIGHT}`, THUMB_QUALITY, path.join(THUMBS_DIR, path.basename(image.url)), ['-strip']);
    const preview = magick(source, `${PREVIEW_WIDTH}x`, PREVIEW_QUALITY, 'webp:-');
    return { ...image, preview: `data:image/webp;base64,${preview.toString('base64')}` };
  });

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${manifest.images.length} embedded previews and thumbnails in gallery/thumbs/.`);
}

if (require.main === module) main();

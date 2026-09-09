const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'gallery', 'gallery.json');
const PREVIEW_WIDTH = 64;
const PREVIEW_QUALITY = 55;

function generatePreview(imagePath) {
  const output = execFileSync('magick', [
    imagePath,
    '-auto-orient',
    '-resize', `${PREVIEW_WIDTH}x`,
    '-quality', String(PREVIEW_QUALITY),
    'webp:-'
  ]);
  return `data:image/webp;base64,${output.toString('base64')}`;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  manifest.images = manifest.images.map((image) => {
    const imagePath = path.join(ROOT, image.url.replace(/^\//, ''));
    return {
      ...image,
      preview: generatePreview(imagePath)
    };
  });

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${manifest.images.length} embedded gallery previews.`);
}

if (require.main === module) main();

module.exports = { generatePreview };

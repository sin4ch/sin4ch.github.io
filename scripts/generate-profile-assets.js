const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'profile-picture.png');

function runMagick(args, input) {
  return execFileSync('magick', args, input ? { input } : undefined);
}

function resize(master, size, format, quality) {
  const args = ['png:-', '-resize', `${size}x${size}`];
  if (quality) args.push('-quality', String(quality));
  args.push(`${format}:-`);
  return runMagick(args, master);
}

function main() {
  const master = runMagick([
    SOURCE_PATH,
    '-alpha', 'set',
    '(', '-size', '1024x1024', 'xc:none', '-fill', 'white', '-draw', 'circle 512,512 512,0', ')',
    '-compose', 'CopyOpacity',
    '-composite',
    'png:-'
  ]);

  fs.writeFileSync(path.join(ROOT, 'profile-picture.png'), master);
  fs.writeFileSync(path.join(ROOT, 'profile-picture.webp'), resize(master, 1024, 'webp', 84));
  fs.writeFileSync(path.join(ROOT, 'profile-picture-128.webp'), resize(master, 128, 'webp', 82));
  fs.writeFileSync(path.join(ROOT, 'favicon-16x16.png'), resize(master, 16, 'png'));
  fs.writeFileSync(path.join(ROOT, 'favicon-32x32.png'), resize(master, 32, 'png'));
  fs.writeFileSync(path.join(ROOT, 'favicon-48x48.png'), resize(master, 48, 'png'));

  const icon = runMagick([
    'png:-',
    '-define', 'icon:auto-resize=48,32,16',
    'ico:-'
  ], master);
  fs.writeFileSync(path.join(ROOT, 'favicon.ico'), icon);
  console.log('Generated circular profile and favicon assets.');
}

if (require.main === module) main();

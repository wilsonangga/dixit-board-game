// Survey actual dimensions of extracted images
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

(async () => {
  const files = fs.readdirSync('extracted').filter((f) => /\.(png|jpe?g)$/i.test(f));
  const byDim = {};
  for (const f of files) {
    const m = await sharp(path.join('extracted', f)).metadata();
    const k = `${m.width}x${m.height}`;
    (byDim[k] ||= []).push(f);
  }
  for (const [k, v] of Object.entries(byDim).sort((a, b) => b[1].length - a[1].length)) {
    console.log(k.padEnd(12), v.length, v.slice(0, 3).join(', '));
  }
})();

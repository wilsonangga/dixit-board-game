// Upscale the 84 extracted card images (184x240) to HD and save as public/cards/N.webp
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SRC = 'extracted';
const OUT = path.join('public', 'cards');
const TARGET_W = 510; // ~5x upscale of 102x146
const TARGET_H = 730;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f));
  const cards = [];
  for (const f of files) {
    const meta = await sharp(path.join(SRC, f)).metadata();
    // Card faces are ~102-105px wide with card aspect; excludes masks, page image, decorations
    if (meta.width >= 100 && meta.width <= 110) cards.push(f);
  }
  // stable, natural sort: img_p0_1.png ... by page then index
  cards.sort((a, b) => {
    const pa = a.match(/img_p(\d+)_(\d+)/);
    const pb = b.match(/img_p(\d+)_(\d+)/);
    return (Number(pa[1]) - Number(pb[1])) || (Number(pa[2]) - Number(pb[2]));
  });
  console.log('card images found:', cards.length);
  if (cards.length !== 84) console.warn('WARNING: expected 84 cards');

  let id = 0;
  for (const f of cards) {
    id++;
    await sharp(path.join(SRC, f))
      .resize(TARGET_W, TARGET_H, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
      .sharpen({ sigma: 0.8 })
      .webp({ quality: 88 })
      .toFile(path.join(OUT, `${id}.webp`));
  }
  console.log(`wrote ${id} cards to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

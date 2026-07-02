/* Procedural dreamlike card art — deterministic SVG per card id (1..84). */
'use strict';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  { sky: ['#1a1040', '#4a2a7a', '#c96f9b'], ground: '#120a2e', accent: '#ffd97d', glow: '#fff3c4' },
  { sky: ['#03203c', '#0a4d68', '#5fc9c9'], ground: '#021526', accent: '#ffe98a', glow: '#d3fbf9' },
  { sky: ['#2d0b3a', '#7b2d5e', '#f18f6b'], ground: '#1d0726', accent: '#ffe0b5', glow: '#ffd1a8' },
  { sky: ['#0b2b26', '#235347', '#8eb69b'], ground: '#051f1a', accent: '#f7e9a0', glow: '#daf1de' },
  { sky: ['#241468', '#9f2b68', '#f79bd3'], ground: '#180c4f', accent: '#fff0ce', glow: '#ffd9ec' },
  { sky: ['#1f2544', '#39418f', '#81a3e6'], ground: '#141833', accent: '#ffe8a3', glow: '#dbe6ff' },
  { sky: ['#3a0519', '#8a1f4a', '#e9a1b0'], ground: '#26030f', accent: '#ffe2a8', glow: '#ffd6de' },
  { sky: ['#122620', '#31543f', '#d6ad60'], ground: '#0a1712', accent: '#f4ebd0', glow: '#ffe9b0' },
  { sky: ['#151d3b', '#6f5b8f', '#d99ec9'], ground: '#0e1330', accent: '#fff1b8', glow: '#f2ddff' },
  { sky: ['#04293a', '#396d7c', '#ecb365'], ground: '#031f2c', accent: '#fff0c9', glow: '#ffe1a1' },
];

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

function stars(rnd, n, w, h) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = (rnd() * w).toFixed(1);
    const y = (rnd() * h * 0.6).toFixed(1);
    const r = (0.5 + rnd() * 1.6).toFixed(2);
    const o = (0.35 + rnd() * 0.6).toFixed(2);
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
  }
  return s;
}

function hills(rnd, pal, w, h) {
  let s = '';
  const layers = 2 + Math.floor(rnd() * 2);
  for (let l = 0; l < layers; l++) {
    const base = h * (0.62 + l * 0.13);
    const amp = 18 + rnd() * 30;
    let d = `M0 ${h} L0 ${base.toFixed(1)}`;
    for (let x = 0; x <= w; x += w / 4) {
      const cx = x + w / 8;
      const cy = base - amp * (rnd() - 0.3);
      d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${(x + w / 4).toFixed(1)} ${(base + (rnd() - 0.5) * amp * 0.6).toFixed(1)}`;
    }
    d += ` L${w} ${h} Z`;
    const op = (0.55 + l * 0.2).toFixed(2);
    s += `<path d="${d}" fill="${pal.ground}" opacity="${op}"/>`;
  }
  return s;
}

function moon(rnd, pal, w) {
  const x = 30 + rnd() * (w - 60);
  const y = 30 + rnd() * 60;
  const r = 14 + rnd() * 16;
  const crescent = rnd() < 0.5;
  let s = `<circle cx="${x}" cy="${y}" r="${r + 8}" fill="${pal.glow}" opacity="0.18"/>`;
  s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${pal.accent}"/>`;
  if (crescent) {
    s += `<circle cx="${x + r * 0.45}" cy="${y - r * 0.2}" r="${r * 0.85}" fill="url(#sky)" opacity="0.9"/>`;
  }
  return s;
}

function tree(rnd, pal, x, baseY, scale) {
  const trunkH = 26 * scale;
  const kind = rnd();
  let s = `<rect x="${x - 1.6 * scale}" y="${baseY - trunkH}" width="${3.2 * scale}" height="${trunkH}" rx="1.5" fill="#0a0618" opacity="0.9"/>`;
  if (kind < 0.5) {
    for (let i = 0; i < 3; i++) {
      const r = (12 - i * 3) * scale;
      s += `<circle cx="${x}" cy="${baseY - trunkH - i * 9 * scale}" r="${r}" fill="#0a0618" opacity="0.92"/>`;
    }
  } else {
    const wdt = 16 * scale;
    const hgt = 34 * scale;
    s += `<path d="M${x} ${baseY - trunkH - hgt} L${x - wdt / 2} ${baseY - trunkH + 4} L${x + wdt / 2} ${baseY - trunkH + 4} Z" fill="#0a0618" opacity="0.92"/>`;
  }
  return s;
}

function creature(rnd, pal, w, h) {
  // whimsical floating creature: balloon, jellyfish, fish, or bird flock
  const kind = Math.floor(rnd() * 4);
  const x = w * (0.2 + rnd() * 0.6);
  const y = h * (0.2 + rnd() * 0.35);
  const c = pal.accent;
  if (kind === 0) {
    // hot air balloon
    const r = 13 + rnd() * 7;
    return (
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="0.95"/>` +
      `<path d="M${x - r} ${y} A ${r} ${r} 0 0 0 ${x + r} ${y}" fill="#0a0618" opacity="0.25"/>` +
      `<line x1="${x - r * 0.5}" y1="${y + r * 0.8}" x2="${x - 4}" y2="${y + r + 12}" stroke="#0a0618" stroke-width="1"/>` +
      `<line x1="${x + r * 0.5}" y1="${y + r * 0.8}" x2="${x + 4}" y2="${y + r + 12}" stroke="#0a0618" stroke-width="1"/>` +
      `<rect x="${x - 5}" y="${y + r + 12}" width="10" height="8" rx="2" fill="#0a0618" opacity="0.9"/>`
    );
  }
  if (kind === 1) {
    // jellyfish
    const r = 12 + rnd() * 6;
    let s = `<path d="M${x - r} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y} Z" fill="${c}" opacity="0.9"/>`;
    for (let i = -2; i <= 2; i++) {
      const tx = x + i * (r / 2.6);
      s += `<path d="M${tx} ${y} q ${3 * (i % 2 ? 1 : -1)} ${r} 0 ${r * 1.8}" stroke="${c}" stroke-width="1.4" fill="none" opacity="0.75"/>`;
    }
    return s;
  }
  if (kind === 2) {
    // fish
    const fw = 22 + rnd() * 8;
    return (
      `<ellipse cx="${x}" cy="${y}" rx="${fw / 2}" ry="${fw / 4}" fill="${c}" opacity="0.95"/>` +
      `<path d="M${x + fw / 2} ${y} l ${fw / 3} ${-fw / 4} l 0 ${fw / 2} Z" fill="${c}" opacity="0.95"/>` +
      `<circle cx="${x - fw / 4}" cy="${y - 2}" r="1.8" fill="#0a0618"/>`
    );
  }
  // bird flock
  let s = '';
  for (let i = 0; i < 4; i++) {
    const bx = x + (rnd() - 0.5) * 60;
    const by = y + (rnd() - 0.5) * 40;
    const bw = 6 + rnd() * 5;
    s += `<path d="M${bx - bw} ${by} Q ${bx - bw / 2} ${by - bw / 1.5} ${bx} ${by} Q ${bx + bw / 2} ${by - bw / 1.5} ${bx + bw} ${by}" stroke="#0a0618" stroke-width="1.6" fill="none" opacity="0.85"/>`;
  }
  return s;
}

function bubbles(rnd, pal, w, h) {
  let s = '';
  const n = 3 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = h * (0.15 + rnd() * 0.55);
    const r = 3 + rnd() * 9;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${pal.glow}" stroke-width="1.1" opacity="${(0.2 + rnd() * 0.35).toFixed(2)}"/>`;
  }
  return s;
}

function tower(rnd, pal, w, h) {
  const x = w * (0.15 + rnd() * 0.7);
  const tw = 14 + rnd() * 10;
  const th = 60 + rnd() * 50;
  const baseY = h * 0.86;
  let s = `<rect x="${x - tw / 2}" y="${baseY - th}" width="${tw}" height="${th}" fill="#0a0618" opacity="0.92"/>`;
  s += `<path d="M${x - tw / 2 - 4} ${baseY - th} L${x} ${baseY - th - 20} L${x + tw / 2 + 4} ${baseY - th} Z" fill="#0a0618" opacity="0.92"/>`;
  // lit windows
  const rows = Math.floor(th / 18);
  for (let i = 0; i < rows; i++) {
    if (rnd() < 0.65) {
      s += `<rect x="${x - 2.5}" y="${baseY - th + 8 + i * 18}" width="5" height="7" rx="1" fill="${pal.accent}" opacity="0.95"/>`;
    }
  }
  return s;
}

/** Returns an SVG string for card `id`. */
function cardArt(id) {
  const rnd = mulberry32(id * 2654435761 + 7);
  const w = 200;
  const h = 300;
  const pal = PALETTES[Math.floor(rnd() * PALETTES.length)];
  const gid = `sky`;

  let inner = '';
  inner += stars(rnd, 22 + Math.floor(rnd() * 26), w, h);
  inner += moon(rnd, pal, w);
  if (rnd() < 0.55) inner += bubbles(rnd, pal, w, h);
  inner += hills(rnd, pal, w, h);
  if (rnd() < 0.45) inner += tower(rnd, pal, w, h);
  const trees = Math.floor(rnd() * 4);
  for (let i = 0; i < trees; i++) {
    inner += tree(rnd, pal, 20 + rnd() * (w - 40), h * (0.88 + rnd() * 0.08), 0.7 + rnd() * 0.7);
  }
  inner += creature(rnd, pal, w, h);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${pal.sky[0]}"/>` +
    `<stop offset="0.55" stop-color="${pal.sky[1]}"/>` +
    `<stop offset="1" stop-color="${pal.sky[2]}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#${gid})"/>` +
    inner +
    `<rect width="${w}" height="${h}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3" rx="6"/>` +
    `</svg>`
  );
}

const artCache = new Map();
function cardArtCached(id) {
  if (!artCache.has(id)) artCache.set(id, cardArt(id));
  return artCache.get(id);
}

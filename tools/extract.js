// Extract embedded images from DIXIT_OVERVIEW.pdf into ./extracted
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
const { exportImages } = require('pdf-export-images');

exportImages('DIXIT_OVERVIEW.pdf', 'extracted')
  .then((imgs) => {
    console.log('extracted', imgs.length, 'images');
    // summarize sizes
    const byDim = {};
    for (const i of imgs) {
      const k = `${i.width}x${i.height}`;
      byDim[k] = (byDim[k] || 0) + 1;
    }
    console.log(byDim);
  })
  .catch((e) => { console.error(e); process.exit(1); });

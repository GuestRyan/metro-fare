const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const checkInterface = require('./ui-cases.cjs');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.QA_DIR || path.join(root, 'workfiles/ui-checks'));

async function main() {
  await fs.mkdir(path.join(out, 'screenshots'), { recursive: true });
  const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_PATH ? {executablePath: process.env.BROWSER_PATH} : {channel: 'msedge'})});
  try {
    const context = await browser.newContext({viewport: {width: 1360, height: 900}, acceptDownloads: true});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'release/web/index.html')).href);
    const result = await checkInterface(page, out);
    if (errors.length) throw new Error(errors.join('\n'));
    result.browser = await browser.version();
    result.entry = 'file://';
    await fs.writeFile(path.join(out, 'ui-results.json'), JSON.stringify(result, null, 2));
    console.log(result.passed + ' UI checks passed');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

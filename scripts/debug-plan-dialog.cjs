const { chromium } = require(process.env.PW_CORE ?? 'C:/Users/step1/pwtmp/node_modules/playwright-core');
const fs = require('fs');
const S = JSON.parse(fs.readFileSync('.git/qa-state.json'));

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'wp_session', value: S.tokens.manager, url: S.base }]);
  const p = await ctx.newPage();
  await p.goto(S.base + '/dashboard/account', { waitUntil: 'networkidle' });

  // Switch to plans tab
  console.log('Switching to plans tab...');
  const plansTab = p.getByRole('button', { name: 'See plans' }).first();
  await plansTab.click();
  await p.waitForTimeout(1000);

  // Click on a plan subscribe button (e.g. Growth plan)
  console.log('Finding plan button...');
  const planBtns = await p.locator('div.plan button.btn').all();
  console.log('Found plan buttons:', planBtns.length);
  if (planBtns.length > 0) {
    await planBtns[0].click();
    await p.waitForTimeout(1000);

    const dialogs = await p.evaluate(() =>
      Array.from(document.querySelectorAll('[role="dialog"], .lockwrap')).map(d => ({
        tagName: d.tagName,
        className: d.className,
        ariaLabel: d.getAttribute('aria-label'),
        text: d.innerText.slice(0, 150)
      }))
    );
    console.log('Dialogs found after clicking plan button:', dialogs);
  }

  await browser.close();
})();

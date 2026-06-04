import { chromium } from 'playwright';

async function runDiagnostics() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:8080/...');
  await page.goto('http://localhost:8080/');

  // Wait for loading screen to disappear
  console.log('Waiting for application to load...');
  await page.waitForSelector('#root', { timeout: 15000 });
  // Wait a bit for React to render
  await page.waitForTimeout(3000);

  console.log('Opening Command Dialog (Control+K)...');
  await page.keyboard.press('Control+k');

  console.log('Waiting for Command Dialog to appear...');
  const commandItem = page.locator('span:has-text("Run System Demo Tests")');
  await commandItem.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Command Dialog opened.');

  console.log('Clicking "Run System Demo Tests" command...');
  await commandItem.click();

  console.log('Waiting for Test Diagnostics modal...');
  const title = page.locator('div:has-text("Test Diagnostics")');
  await title.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Diagnostics modal is open.');

  console.log('Waiting for diagnostics tests to run and complete...');
  // The tests take up to 2-3 minutes because they do offline audio context rendering, vocal generation, and canvas visualizer media recording.
  // We will check the status text: the modal shows "Completed" when finished.
  const completedStatus = page.locator('p:has-text("Completed")');
  await completedStatus.waitFor({ state: 'visible', timeout: 180000 }); // 3 minutes timeout
  console.log('✓ Diagnostics completed successfully!');

  // Capture all test results
  console.log('\n--- DIAGNOSTICS RESULTS ---');
  const testCards = page.locator('.rounded-2xl.border.bg-card');
  const count = await testCards.count();
  let failed = 0;
  for (let i = 0; i < count; i++) {
    const card = testCards.nth(i);
    // Skip summary cards at the top
    const isSummaryCard = await card.locator('p:has-text("Status"), p:has-text("Passed"), p:has-text("Failed"), p:has-text("Command")').count() > 0;
    if (isSummaryCard) continue;

    const titleText = await card.locator('p.font-medium').textContent();
    const summaryText = await card.locator('p.text-muted-foreground.mt-1').first().textContent();
    const statusText = await card.locator('span.rounded-full').textContent();
    
    console.log(`[${statusText.trim().toUpperCase()}] ${titleText.trim()}: ${summaryText.trim()}`);
    if (statusText.toLowerCase().includes('fail')) {
      failed++;
      const details = await card.locator('p.text-sm.text-muted-foreground').allTextContents();
      for (const detail of details) {
        console.log(`   Detail: ${detail.trim()}`);
      }
    }
  }

  // Take a screenshot of the modal
  const screenshotPath = 'diagnostics_result.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`✓ Saved screenshot to ${screenshotPath}`);

  await browser.close();

  if (failed > 0) {
    throw new Error(`${failed} diagnostics tests failed!`);
  }
  console.log('ALL DIAGNOSTICS TESTS PASSED 🎉');
}

runDiagnostics().catch(err => {
  console.error('DIAGNOSTICS RUN FAILED ❌', err);
  process.exit(1);
});

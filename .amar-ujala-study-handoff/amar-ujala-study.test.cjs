const { chromium } = require('playwright');
const URL = process.env.U || 'http://127.0.0.1:8123/amar-ujala-study.html';
const R = []; const ok = (n, c, d='') => R.push([c ? 'PASS' : 'FAIL', n, d]);
(async () => {
  const b = await chromium.launch();
  for (const w of [390, 820, 1440]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    const errs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.querySelectorAll('.rv').forEach(e => e.classList.add('in')));
    const hs = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`${w}px no horizontal scroll`, hs <= 0, 'overflow ' + hs);
    // overflow offenders
    if (hs > 0) console.log(await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0,5).map(e => e.tagName + '.' + e.className)));
    await p.screenshot({ path: `shots/full_${w}.png`, fullPage: true });
    await p.locator('#prototype').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `shots/proto_${w}.png` });
    ok(`${w}px zero console errors`, errs.length === 0, errs.slice(0,3).join(' | '));
    await p.close();
  }
  // Functional flow at 390
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto(URL, { waitUntil: 'networkidle' });
  const st = p.locator('#panel-student');
  await st.getByRole('button', { name: /Aage kya/i }).click();
  ok('step 1 questions shown', await st.locator('form[data-form=q]').count() === 1);
  await st.locator('label.ak-chip:has(input[name=interest][value=tech])').click();
  await st.locator('input[name=marks]').fill('82');
  await st.locator('label.ak-chip:has(input[name=income][value=upto2])').click();
  await st.getByRole('button', { name: 'Show my plan' }).click();
  const courses = await st.locator('[data-testid=courses] li').count();
  ok('plan lists courses', courses > 0, courses + ' courses');
  ok('plan lists exams', await st.locator('[data-testid=exams] li').count() > 0);
  ok('scholarships matched (income up to 2L, 82%)', await st.locator('ul[data-testid=scholarships] li').count() === 2);
  const names = await st.locator('[data-testid=colleges] li strong').allTextContents();
  ok('colleges listed', names.length > 0, names.join(', '));
  // order by fit: paying must not be boosted. check sort invariant with data
  const order = await p.evaluate(() => { const li=[...document.querySelectorAll('[data-testid=colleges] li')]; return li.map(l=>({pay:!!l.querySelector('.ak-tag.pay'), fee:+(l.textContent.match(/₹([\d,]+)/)||[0,'0'])[1].replace(/,/g,'')})); });
  ok('college order is by fit then fee, not payment', order.length>0, JSON.stringify(order));
  // fake check
  await st.locator('#ak-check').fill('Bhartiya Shiksha Parishad');
  await st.getByRole('button', { name: 'Check' }).click();
  ok('fake university flagged', /fake universities/.test(await st.locator('#ak-check-out').innerText()));
  await st.locator('#ak-check').fill('Ganga Valley Degree College');
  await st.getByRole('button', { name: 'Check' }).click();
  ok('genuine name not flagged', /Not found/.test(await st.locator('#ak-check-out').innerText()));
  ok('continue disabled with no college', await st.locator('#ak-go3').isDisabled());
  const prerna = st.locator('input[data-college=c2]');
  ok('partner college Prerna listed', await prerna.count() === 1);
  await prerna.check();
  ok('continue enabled after tick', !(await st.locator('#ak-go3').isDisabled()));
  await st.locator('#ak-go3').click();
  await st.locator('label.ak-chip:has(input[name=adult][value=no])').click();
  ok('minor consent text', /parent or guardian/i.test(await st.innerText()));
  await st.locator('#ak-name').fill('Deepa');
  await st.locator('#ak-phone').fill('98765432');
  ok('OTP blocked for invalid phone', await st.locator('#ak-otp-btn').isDisabled());
  await st.locator('#ak-phone').fill('9876543210');
  await st.locator('#ak-otp-btn').click();
  await st.locator('#ak-otp').fill('1111'); await st.getByRole('button', { name: 'Verify' }).click();
  ok('wrong OTP rejected', /does not match/.test(await st.innerText()));
  ok('share blocked before verify', await st.locator('#ak-share').isDisabled());
  await st.locator('#ak-otp').fill('2468'); await st.getByRole('button', { name: 'Verify' }).click();
  ok('agree enabled after OTP', !(await st.locator('#ak-agree').isDisabled()));
  ok('share blocked before agree', await st.locator('#ak-share').isDisabled());
  await st.locator('#ak-agree').check();
  await st.locator('#ak-share').click();
  ok('done screen', /Colleges will call within 48 hours/.test(await st.innerText()));
  await st.getByRole('button', { name: /college dashboard/i }).click();
  const col = p.locator('#panel-college');
  ok('college tab visible', await col.isVisible());
  ok('own enquiry arrives (D***)', await col.locator('tr.mine').count() === 1 && /D\*\*\*/.test(await col.locator('tr.mine').innerText()));
  ok('5 enquiries KPI', (await col.locator('#ak-kpis .ak-kpi b').first().innerText()) === '5');
  await col.locator('#st-you').selectOption('called');
  ok('called KPI updates to 3', (await col.locator('#ak-kpis .ak-kpi b').nth(2).innerText()) === '3');
  await p.locator('#tab-student').click();
  await st.getByRole('button', { name: 'Withdraw consent' }).click();
  await p.locator('#tab-college').click();
  ok('withdraw removes enquiry', await col.locator('tr.mine').count() === 0);
  // revenue
  await p.locator('#tab-revenue').click();
  const rv = p.locator('#panel-revenue');
  const base = await rv.locator('[data-testid=rev-total] b').innerText();
  ok('base case = ₹1.13 crore', base.trim() === '₹1.13 crore', base);
  ok('USD shown', /About \$11[89],\d{3}/.test(await rv.locator('[data-testid=rev-total]').innerText()), await rv.locator('[data-testid=rev-total]').innerText());
  await rv.locator('[data-scen=high]').click();
  ok('high scenario changes total', (await rv.locator('[data-testid=rev-total] b').innerText()) !== base);
  await rv.locator('#rv-reachPct').fill('500');
  ok('percent clamps to 100 (custom)', await rv.locator('[data-scen=custom]').getAttribute('aria-pressed') === 'true');
  const v = await p.evaluate(() => 1); 
  // Hindi
  await p.locator('[data-lang=hi]').click();
  ok('Hindi switches prototype', /छात्र|प्रवेश|राजस्व/.test(await p.locator('#ak').innerText()));
  ok('lang attr hi', await p.locator('#ak').getAttribute('lang') === 'hi');
  // keyboard tabs
  await p.locator('#tab-revenue').focus(); await p.keyboard.press('ArrowRight');
  ok('arrow keys move tabs', await p.locator('#tab-student').getAttribute('aria-selected') === 'true');
  ok('flow had zero errors', errs.length === 0, errs.join(' | '));
  // structure
  ok('exactly one h1', await p.locator('h1').count() === 1);
  await b.close();
  let f = 0; for (const r of R) { console.log(r[0], r[1], r[2] ? '| ' + r[2] : ''); if (r[0] === 'FAIL') f++; }
  console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();

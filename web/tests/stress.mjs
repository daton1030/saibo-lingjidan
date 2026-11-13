// 注意：公开模式已取消模拟领取成功。「一键签到」路径只在 ?demo=1 的演示模式下有效。不要为迁就本脚本而把模拟签到带回公开模式。
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const BASE = process.argv[2] || 'http://localhost:8080/';
const OUT = '/workspace/saibo-lingjidan-demo/screenshots/';
const label = process.argv[3] || 'run';
const results = {};
const errors = [];
const browser = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars']});
async function newPage(vp={width:1280,height:800}, init) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on('pageerror', e => errors.push({where:page.url(), type:'pageerror', msg:e.message}));
  page.on('console', m => { if (m.type()==='error') errors.push({type:'console', msg:m.text()}); });
  page.on('requestfailed', r => errors.push({type:'requestfailed', msg:r.url()}));
  if (init) await page.evaluateOnNewDocument(init);
  return page;
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const snap = page => page.evaluate(() => ({
  cards: cards.map(c=>({id:c.id,status:c.status,balance:c.balance,q:c.quotaText,cr:c.claimedReward||0})),
  today: document.getElementById('todayAmount').textContent,
  month: document.getElementById('monthAmount').textContent,
  inApp: document.getElementById('inAppValue').textContent,
  outApp: document.getElementById('outAppValue').textContent,
  batchBtn: document.getElementById('batchBtn').textContent,
  toasts: document.querySelectorAll('#toasts .toast').length,
  drawerTitle: document.getElementById('drawerTitle')?.textContent||null,
  drawerOpen: document.getElementById('overlay').classList.contains('is-open'),
  modalOpen: document.getElementById('modalRoot').classList.contains('is-open'),
}));

// ---------- A. load timings
results.load = {};
for (const [name, vp] of [['desktop',{width:1280,height:800}],['mobile',{width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2}]]) {
  const runs = [];
  for (let i=0;i<5;i++) {
    const page = await newPage(vp);
    await page.evaluateOnNewDocument(() => {
      window.__lcp = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({type:'largest-contentful-paint', buffered:true});
    });
    await page.goto(BASE + '?fresh=1&guide=0', {waitUntil:'load'});
    await sleep(500);
    const t = await page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return {ttfb:n.responseStart, dcl:n.domContentLoadedEventEnd, load:n.loadEventEnd, fcp:fcp?fcp.startTime:null, lcp:window.__lcp, transfer:n.transferSize, cards:document.querySelectorAll('.card').length,
        hScroll: document.documentElement.scrollWidth > innerWidth};
    });
    runs.push(t);
    await page.close();
  }
  const med = k => { const a = runs.map(r=>r[k]).filter(x=>x!=null).sort((a,b)=>a-b); return a[Math.floor(a.length/2)]; };
  results.load[name] = {runs: runs.length, median:{ttfb:med('ttfb'),dcl:med('dcl'),load:med('load'),fcp:med('fcp'),lcp:med('lcp')}, cards:runs[0].cards, horizontalOverflow: runs.some(r=>r.hScroll), transfer:runs[0].transfer};
}

// ---------- expected claim math
const fresh = async (vp) => { const p = await newPage(vp); await p.goto(BASE+'?fresh=1&guide=0'); await p.evaluate(()=>localStorage.clear()); await p.goto(BASE+'?fresh=1&guide=0'); return p; };

// ---------- B1. 200 rapid clicks on 一键签到 (same card)
{
  const page = await fresh();
  const before = await snap(page);
  await page.evaluate(() => document.querySelector('[data-id="modelscope"]').click());
  await page.evaluate(() => { for (let i=0;i<200;i++) { const b=document.getElementById('checkinBtn'); if (b) b.click(); else document.querySelector('#drawerFoot [data-act]')?.click(); } });
  await sleep(1500);
  const a = await snap(page);
  results.rapidCheckin = {modelscope: a.cards.find(c=>c.id==='modelscope'), todayBefore:before.today, todayAfter:a.today, monthAfter:a.month, toasts:a.toasts};
  await page.close();
}
// ---------- B2. batch clicks + 重复"开始领取"
{
  const page = await fresh();
  await page.evaluate(() => {
    for (let i=0;i<200;i++) document.getElementById('batchBtn').click();
  });
  // click primary in modal 200 times
  await page.evaluate(() => { const prim=[...document.querySelectorAll('#modalActions button')].find(b=>b.classList.contains('primary')); for (let i=0;i<200;i++) prim.click(); });
  await sleep(5000);
  // click again second round while claimed (modal re-open) 
  const a = await snap(page);
  const defaults = await page.evaluate(() => DEFAULT_CARDS.map(c=>({id:c.id,balance:c.balance,reward:c.reward,status:c.status})));
  const wrong = [];
  for (const d of defaults) {
    const c = a.cards.find(x=>x.id===d.id);
    if (d.status==='claimable') { const exp = d.balance + (d.reward||d.balance); if (c.balance!==exp) wrong.push({id:d.id, expected:exp, got:c.balance}); }
  }
  results.rapidBatch = {wrongBalances:wrong, tongyi:a.cards.find(c=>c.id==='tongyi'), today:a.today, month:a.month, batchBtn:a.batchBtn};
  await page.close();
}
// ---------- B3. 200 reset clicks, then totals vs defaults
{
  const page = await fresh();
  const base = await snap(page);
  await page.evaluate(() => document.querySelector('[data-id="modelscope"]').click());
  await page.evaluate(() => document.getElementById('checkinBtn').click());
  await sleep(1200);
  await page.evaluate(() => { for (let i=0;i<200;i++) document.getElementById('resetBtn').click(); });
  await sleep(300);
  const a = await snap(page);
  results.rapidReset = {sameAsFresh: JSON.stringify(a.cards)===JSON.stringify(base.cards) && a.today===base.today && a.month===base.month, toastsAfter200:a.toasts, today:a.today, month:a.month};
  await sleep(3000);
  results.rapidReset.toastsAfter3s = (await snap(page)).toasts;
  await page.close();
}
// ---------- B4. reset during in-flight checkin / batch
{
  const page = await fresh();
  await page.evaluate(() => document.querySelector('[data-id="modelscope"]').click());
  await page.evaluate(() => document.getElementById('checkinBtn').click());
  await sleep(100);
  await page.evaluate(() => document.getElementById('resetBtn').click());
  await sleep(1500);
  const a = await snap(page);
  results.resetDuringCheckin = {modelscopeAfter: a.cards.find(c=>c.id==='modelscope'), drawerOpen:a.drawerOpen, today:a.today};
  // batch in-flight + reset
  await page.evaluate(() => { document.getElementById('batchBtn').click(); [...document.querySelectorAll('#modalActions button')].find(b=>b.classList.contains('primary')).click(); });
  await sleep(700);
  await page.evaluate(() => document.getElementById('resetBtn').click());
  await sleep(4500);
  const b = await snap(page);
  results.resetDuringBatch = {claimedAfterReset: b.cards.filter(c=>c.status==='claimed').map(c=>c.id), modalOpen:b.modalOpen, today:b.today};
  await page.close();
}
// ---------- B5. stale drawer: checkin then switch card
{
  const page = await fresh();
  await page.evaluate(() => document.querySelector('[data-id="modelscope"]').click());
  await page.evaluate(() => document.getElementById('checkinBtn').click());
  await page.evaluate(() => { document.getElementById('closeDrawer').click(); document.querySelector('[data-id="doubao"]').click(); });
  await sleep(1300);
  const a = await snap(page);
  // second: close drawer, never reopen
  await page.evaluate(() => { document.getElementById('closeDrawer').click(); });
  results.staleDrawer = {afterSwitch_activeCardShouldBeDoubao_drawerTitle:a.drawerTitle};
  // checkin on card B while A busy
  await page.evaluate(() => { document.getElementById('resetBtn').click(); });
  await sleep(200);
  await page.evaluate(() => document.querySelector('[data-id="modelscope"]').click());
  await page.evaluate(() => document.getElementById('checkinBtn').click());
  await page.evaluate(() => { document.getElementById('closeDrawer').click(); document.querySelector('[data-id="meeo"]').click(); });
  const hasBtn = await page.evaluate(() => { const b=document.getElementById('checkinBtn'); return b?b.textContent:null; });
  await page.evaluate(() => document.getElementById('checkinBtn')?.click());
  await sleep(1500);
  const c = await snap(page);
  results.checkinWhileOtherBusy = {btnShown:hasBtn, meeo:c.cards.find(x=>x.id==='meeo').status, modelscope:c.cards.find(x=>x.id==='modelscope').status};
  await page.screenshot({path: OUT+`test-${label}-stale.png`});
  await page.close();
}
// ---------- C. open/close each drawer
{
  const page = await fresh();
  const ids = await page.evaluate(()=>cards.map(c=>c.id));
  const bad = [];
  for (const id of ids) {
    await page.evaluate(i => document.querySelector(`[data-id="${i}"]`).click(), id);
    const r = await page.evaluate(() => ({t:document.getElementById('drawerTitle')?.textContent, open:document.getElementById('overlay').classList.contains('is-open'), foot:document.getElementById('drawerFoot').innerText.trim()}));
    const name = await page.evaluate(i=>cards.find(c=>c.id===i).name, id);
    if (r.t!==name || !r.open) bad.push({id, r});
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(()=>!document.getElementById('overlay').classList.contains('is-open'));
    if (!closed) bad.push({id, notClosed:true});
    // open and close via button / overlay click
    await page.evaluate(i => document.querySelector(`[data-id="${i}"]`).click(), id);
    await page.evaluate(() => document.getElementById('closeDrawer').click());
  }
  // modals for official/need_auth
  for (const id of ['doubao','jimeng']) {
    await page.evaluate(i => document.querySelector(`[data-id="${i}"]`).click(), id);
    await page.evaluate(() => document.querySelector('#drawerFoot [data-act]').click());
    const m = await page.evaluate(()=>document.getElementById('modalRoot').classList.contains('is-open'));
    if(!m) bad.push({id,noModal:true});
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  }
  results.drawers = {cards:ids.length, problems:bad};
  await page.close();
}
// ---------- D. localStorage corruption
{
  const cases = {
    invalidJson:'{not json', jsonNull:'null', jsonString:'"abc"', cardsNull:'{"cards":null}', cardsObject:'{"cards":{}}',
    nullEntries:'{"cards":[null,1,"x",{"id":"modelscope"}]}',
    badStatus:'{"cards":[{"id":"modelscope","status":"hax"},{"id":"meeo","status":"<img src=x onerror=window.__xss=1>"}]}',
    intlMadeClaimable:'{"cards":[{"id":"workbuddy-intl","status":"claimable"}]}',
    badTypes:'{"cards":[{"id":"modelscope","balance":"9e999","quotaText":{"a":1},"claimedReward":"x"}]}',
    xssQuota:'{"cards":[{"id":"modelscope","quotaText":"<img src=x onerror=window.__xss=1>"}]}',
    proto:'{"cards":[{"id":"__proto__","status":"claimed"},{"id":"constructor"}]}',
    hugeBalance:'{"cards":[{"id":"modelscope","status":"claimed","balance":1e308}]}',
    emptyString:'',
  };
  results.corruptStorage = {};
  for (const [k,v] of Object.entries(cases)) {
    const page = await newPage();
    await page.evaluateOnNewDocument((v) => { try { localStorage.setItem('saibo-lingjidan-demo-v1', v); localStorage.setItem('saibo-lingjidan-guide-seen','1'); } catch(e){} }, v);
    const before = errors.length;
    await page.goto(BASE, {waitUntil:'load'});
    const r = await page.evaluate(() => ({
      cardsRendered: document.querySelectorAll('.card').length,
      undefinedBadges: [...document.querySelectorAll('.badge')].filter(b=>/undefined|^$/.test(b.textContent.trim())).length,
      xss: !!window.__xss, today:document.getElementById('todayAmount').textContent, month:document.getElementById('monthAmount').textContent,
      intl: cards.find(c=>c.id==='workbuddy-intl').status,
      ms: {s:cards.find(c=>c.id==='modelscope').status, b:cards.find(c=>c.id==='modelscope').balance, q:cards.find(c=>c.id==='modelscope').quotaText},
    }));
    results.corruptStorage[k] = {...r, newErrors: errors.length-before};
    if (k==='badStatus' || k==='badTypes') {
      // try to open every drawer
      const e0 = errors.length;
      for (const id of await page.evaluate(()=>cards.map(c=>c.id))) { await page.evaluate(i=>document.querySelector(`[data-id="${i}"]`)?.click(), id); await page.keyboard.press('Escape'); }
      results.corruptStorage[k].errorsOpeningDrawers = errors.length-e0;
    }
    await page.close();
  }
  // storage that throws
  const page = await newPage({width:1280,height:800}, () => {
    const boom = () => { throw new DOMException('denied','SecurityError'); };
    Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
  });
  const b0 = errors.length;
  await page.goto(BASE, {waitUntil:'load'});
  await page.evaluate(() => document.querySelector('[data-id="modelscope"]').click());
  await page.evaluate(() => document.getElementById('checkinBtn').click());
  await sleep(1200);
  await page.evaluate(() => document.getElementById('resetBtn').click());
  results.storageThrows = {cards: await page.evaluate(()=>document.querySelectorAll('.card').length), newErrors: errors.length-b0};
  await page.close();
}
// ---------- E. scale
results.scale = {};
for (const N of [200, 1000]) {
  const page = await fresh();
  const r = await page.evaluate((N) => {
    const base = DEFAULT_CARDS;
    const t0 = performance.now();
    cards = [];
    for (let i=0;i<N;i++) { const b = base[i % base.length]; cards.push({...b, id: b.id+'-'+i, name:b.name+' '+i, status: i%2? 'claimable':b.status}); }
    renderSummary(); renderGrid();
    const render = performance.now()-t0;
    const t1 = performance.now(); for (let i=0;i<20;i++) renderGrid(); const grid20 = (performance.now()-t1)/20;
    const t2 = performance.now(); openDrawer(cards[N-1].id); const drawer = performance.now()-t2; closeDrawer();
    const t3 = performance.now(); openBatchModal(); const batchModal = performance.now()-t3; hideModal();
    const bytes = new Blob([localStorage.getItem('saibo-lingjidan-demo-v1')||'']).size;
    saveState();
    return {render, renderGridAvg:grid20, drawer, batchModal, domNodes:document.getElementsByTagName('*').length, cardEls:document.querySelectorAll('.card').length, heapMB: performance.memory? performance.memory.usedJSHeapSize/1048576:null};
  }, N);
  // simulate batch: time of one step (saveState+renderSummary+renderGrid) with N cards
  r.batchStepMs = await page.evaluate(() => { const t=performance.now(); saveState(); renderSummary(); renderGrid(); return performance.now()-t; });
  r.pendingForBatch = await page.evaluate(()=>cards.filter(isAuthorizedClaimable).length);
  r.batchEstimateSec = +(r.pendingForBatch*(0.55 + r.batchStepMs/1000)).toFixed(1);
  results.scale[N] = r;
  if (N===1000) await page.screenshot({path: OUT+`test-${label}-scale1000.png`});
  await page.close();
}
// mobile 390 screenshot sanity
{
  const page = await newPage({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await page.goto(BASE+'?fresh=1&guide=0'); await sleep(300);
  await page.screenshot({path:OUT+`test-${label}-mobile.png`});
  await page.close();
}
results.totalErrors = errors;
fs.writeFileSync(`/tmp/stress-${label}.json`, JSON.stringify(results,null,1));
console.log(JSON.stringify(results,null,1));
await browser.close();

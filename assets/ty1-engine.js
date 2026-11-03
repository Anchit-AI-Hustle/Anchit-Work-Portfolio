/* One requestAnimationFrame drives both shop corridors.
   Scroll is spring-damped. Pointer parallax is damped. Offscreen marquees do not run. */
(function () {
  var mount = document.getElementById('ty1Mount');
  if (!mount) return;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var brand = mount.getAttribute('data-brand') === 'deli' ? 'deli' : 'gram';

  var GRAM = {
    world: 'lilac',
    kicker: 'Fuori ora / fresh churn',
    wa: '918130056889',
    planes: [
      ['-900', '16 Arjun Marg', 'Brushed chrome arch', 'Lilac glass on DLF Phase 1. Ten seats, conversation first.'],
      ['-1500', '9-bar extraction', 'The grouphead', '18.5g in, a 9.2 bar shot, 93.5 C boiler. Nagaland and Coorg lots.'],
      ['-2300', 'Gelato wells', 'Small-batch churn', 'Smoked chocolate, pistachio and croissant gelato, served from the lilac counter.'],
      ['-3100', 'The pastry bench', 'From pie shop to purple latte', 'Chef Vanshika Bhatia keeps the counter beverage-first and the lamination tight.'],
      ['-3600', 'The sanctuary', 'Ten seats', 'A compact room in Gurugram. Open daily 8:00 to 22:30. Call +91 81300 56889.']
    ],
    sleeve: { title: 'Coconut cloud matcha and pistachio', note: 'A pairing from the counter.', price: 660, id: 'ty1-pairing', cta: '+ Add pairing, Rs 660' },
    cats: ['ALL', 'COFFEE', 'GELATO', 'SAVOURY', 'PASTRY'],
    items: [
      ['ty1-01', '01', 'COFFEE', 'Coconut Cloud Matcha', 'Uji matcha over tender coconut water.', 340, 'BESTSELLER'],
      ['ty1-02', '02', 'COFFEE', 'Yuzu Espresso Tonic', 'Double ristretto, yuzu cordial, tonic.', 320, 'CITRUS'],
      ['ty1-03', '03', 'COFFEE', 'Salted Maple Oat Cortado', 'Maple, sea salt, oat microfoam.', 290, 'HOT OR ICED'],
      ['ty1-04', '04', 'COFFEE', 'Spanish Saffron Cold Brew', 'Slow drip with Kashmiri saffron.', 310, 'SLOW DRIP'],
      ['ty1-05', '05', 'GELATO', 'Bronte Pistachio Gelato', 'Roasted pistachio, churned in house.', 320, 'GELATO'],
      ['ty1-06', '06', 'GELATO', '70% Dark Chocolate Gelato', 'Dark chocolate stracciatella.', 310, 'GELATO'],
      ['ty1-07', '07', 'GELATO', 'Vanilla and Olive Oil Gelato', 'Vanilla bean with olive oil and salt.', 300, 'CHEF'],
      ['ty1-08', '08', 'GELATO', 'Alphonso Mango Sorbetto', 'Dairy-free Alphonso and passionfruit.', 290, 'VEGAN'],
      ['ty1-09', '09', 'SAVOURY', 'Chicken Katsu Bao', 'Milk bun, slaw, yuzu mayo.', 420, 'SAVOURY'],
      ['ty1-10', '10', 'SAVOURY', 'Truffle Brie Toastie', 'Brie, fig jam, charred brioche.', 440, 'SAVOURY'],
      ['ty1-11', '11', 'SAVOURY', 'Mushroom Bao', 'King oyster, pickled daikon, sesame.', 390, 'VEG'],
      ['ty1-12', '12', 'PASTRY', 'Pistachio Praline Croissant', 'Laminated butter pastry from the bench.', 380, 'PASTRY']
    ],
    boxes: [
      ['The Arjun Marg duo', 'Matcha and a gelato pint for two.', 660, 'ty1-box-1'],
      ['Pozzetti flight', 'Three small-batch pints.', 890, 'ty1-box-2'],
      ['Weekend bao and cold brew', 'Bao plus a bottle of cold brew.', 760, 'ty1-box-3']
    ],
    drops: [
      ['Carpigiani-style pozzetti', 'Gelato held cold behind the lilac glass.'],
      ['Ceremonial Uji matcha', 'First-harvest tencha, whisked to order.'],
      ['Viennoiserie', 'Laminated pastry from the same counter.'],
      ['Ten seats', 'A small room, built for the drink in front of you.'],
      ['Single-estate roasts', 'Nagaland and Coorg, roasted for this bar.']
    ],
    nodes: [
      ['-14 C gelato hold', '12%', '18%'],
      ['9.2 bar extraction', '68%', '16%'],
      ['10 seats', '74%', '62%'],
      ['In-house churn', '18%', '70%'],
      ['18 hr cold brew', '40%', '78%'],
      ['100% arabica lots', '46%', '28%']
    ],
    ticker: 'Gram Latte · Coconut Cloud Matcha · Pistachio Gelato · Croissant Gelato Latte · Uji Matcha · Bao',
    visitTitle: 'Find the counter',
    visitBody: '16 Arjun Marg, Block F, DLF Phase 1, Gurugram 122002. Open daily 8:00 to 22:30 IST.',
    hours: [8, 22.5]
  };

  var DELI = {
    world: 'oxblood',
    kicker: 'Fuori ora / prime cuts',
    wa: '919810002023',
    planes: [
      ['-900', 'Vasant Kunj', 'The boucherie threshold', 'A brass rail and a cold room. Deli Chic, Food For Thought.'],
      ['-1500', 'The slicer', 'Paper-thin cuts', 'Mortadella, salami and pepper crust, sliced to order.'],
      ['-2300', 'The salt room', 'Dry-aged marbling', 'Cuts rested cold before they are trimmed.'],
      ['-3100', 'The smoke', 'Beechwood', 'Bacon and sausages smoked over beechwood, then sealed.'],
      ['-3600', 'The block', 'Chilled dispatch', '0 to 4 C across Delhi NCR. Code WoW20. Call +91 98100 02023.']
    ],
    sleeve: { title: 'Charcuterie and dry-aged slate', note: 'A board from the cold room.', price: 1850, id: 'ty1-slate', cta: '+ Reserve slate, Rs 1,850' },
    cats: ['ALL', 'CHARCUTERIE', 'STEAKS', 'SAUSAGES', 'PATES'],
    items: [
      ['ty1-d01', '01', 'STEAKS', 'Dry-Aged Ribeye 350g', 'Salt-room aged, intramuscular marbling.', 1450, 'AGED'],
      ['ty1-d02', '02', 'CHARCUTERIE', 'Pistachio Mortadella 200g', 'Emulsified, studded with pistachio.', 580, 'SLICED'],
      ['ty1-d03', '03', 'SAUSAGES', 'Beechwood Streaky Bacon 250g', 'Dry-cured belly, smoked over beechwood.', 520, 'BESTSELLER'],
      ['ty1-d04', '04', 'CHARCUTERIE', 'Truffle Chicken Galantine 200g', 'Ballotine with summer truffle.', 540, 'SIGNATURE'],
      ['ty1-d05', '05', 'CHARCUTERIE', 'Calabrian Soppressata 150g', 'Coarse pork with chili.', 620, 'FERMENTED'],
      ['ty1-d06', '06', 'SAUSAGES', 'Emmental Kransky 300g', 'Smoked links with aged cheese.', 560, 'SMOKED'],
      ['ty1-d07', '07', 'CHARCUTERIE', 'Prosciutto Crudo 150g', 'Sea-salt cured, sliced thin.', 890, 'CURED'],
      ['ty1-d08', '08', 'SAUSAGES', 'Nuremberg Bratwurst 300g', 'Marjoram and white pepper.', 490, 'GRILL'],
      ['ty1-d09', '09', 'PATES', 'Duck Liver Pate 180g', 'Terrine under thyme butter.', 640, 'SMALL BATCH'],
      ['ty1-d10', '10', 'SAUSAGES', 'Lamb Merguez 300g', 'Harissa-spiced lamb in natural casing.', 590, 'SPICY'],
      ['ty1-d11', '11', 'CHARCUTERIE', 'Smoked Pepperoni 150g', 'Paprika and applewood.', 480, 'DRY CURED'],
      ['ty1-d12', '12', 'PATES', 'Onion and Fig Confit 200g', 'Balsamic pairing for pate and cheddar.', 390, 'PANTRY']
    ],
    boxes: [
      ['Host charcuterie slate', 'A cold board for the table.', 1650, 'ty1-dbox-1'],
      ['Steak and sausage crate', 'Ribeye plus a smoked link.', 2100, 'ty1-dbox-2'],
      ['Sunday breakfast hamper', 'Bacon, bratwurst and confit.', 1480, 'ty1-dbox-3']
    ],
    drops: [
      ['Salt brick chamber', 'Cuts rested cold before the block.'],
      ['Equilibrium brine', 'A long cure, then the smoke.'],
      ['Slicer calibration', 'Thin slices for the slate.'],
      ['Beechwood smoke', 'The same wood already on this counter.'],
      ['Sealed dispatch', 'Vacuum sealed, then the cold van.']
    ],
    nodes: [
      ['0 to 4 C chain', '14%', '20%'],
      ['Beechwood smoke', '66%', '18%'],
      ['WoW20, 20% off', '70%', '64%'],
      ['Hand cut', '16%', '68%'],
      ['Tellicherry crust', '42%', '76%'],
      ['Vacuum sealed', '44%', '30%']
    ],
    ticker: 'Antibiotic-free poultry · Beechwood bacon · Mortadella · Ribeye · Prawn dim sum · WoW20',
    visitTitle: 'The concierge',
    visitBody: 'Cold-chain dispatch across Delhi NCR, 10:00 to 13:00 and 17:00 to 20:00. WhatsApp +91 98100 02023. Code WoW20.',
    hours: [8, 20]
  };

  var CFG = brand === 'deli' ? DELI : GRAM;
  window.TY1_EXTRAS = CFG.items.concat([CFG.sleeve].concat(CFG.boxes).map(function (row) {
    return { id: row.id || row[3], name: row.title || row[0], price: row.price || row[2], weight: 'pack' };
  })).map(function (row) {
    if (row.name) return row;
    return { id: row[0], name: row[3], price: row[5], weight: 'pack' };
  });

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function btn(label, cls) {
    var b = el('button', cls, label);
    b.type = 'button';
    return b;
  }

  mount.setAttribute('data-ty1', brand);
  document.documentElement.classList.add('ty1-on');

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = '<filter id="freq-wave-filter"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.08" numOctaves="2" result="noise"/><feDisplacementMap id="freq-disp-map" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>';
  mount.appendChild(svg);
  var disp = svg.querySelector('#freq-disp-map');

  function waveTitle(text) {
    var h = el('h2', 'ty1-wave');
    h.setAttribute('data-wave-title', '');
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'char';
      s.textContent = text[i] === ' ' ? '\u00a0' : text[i];
      h.appendChild(s);
    }
    return h;
  }

  /* corridor */
  var walk = el('section', 'ty1-walk');
  walk.id = 'corridor';
  var sticky = el('div', 'ty1-sticky');
  var stage = el('div', 'ty1-stage');
  var planeClass = brand === 'deli' ? 'b-plane' : 'w-plane';
  CFG.planes.forEach(function (p, i) {
    var node = el('div', planeClass);
    node.dataset.z0 = p[0];
    node.dataset.depth = String(8 + i * 4);
    node.innerHTML = '<div class="plane-card"><div class="plane-kicker">' + p[1] + '</div><strong>' + p[2] + '</strong><p>' + p[3] + '</p></div>';
    stage.appendChild(node);
  });
  var hud = el('div', 'ty1-hud', '<div class="track"><i id="walkProgressBar"></i></div><b id="walkProgressLabel">0% DEPTH</b>');
  var audio = el('div', 'ty1-audio');
  audio.innerHTML = '<div class="row"><button type="button" id="ty1Mute">Mute</button><button type="button" id="ty1Play">' + (brand === 'deli' ? 'Atelier ambience' : 'Cafe soundscape') + '</button></div><div class="ty1-eq" id="ty1Eq"></div>';
  for (var eq = 0; eq < 12; eq++) audio.querySelector('#ty1Eq').appendChild(document.createElement('i'));
  sticky.appendChild(stage); sticky.appendChild(hud); sticky.appendChild(audio);
  walk.appendChild(sticky);
  mount.appendChild(walk);
  if (!reduce) walk.classList.add('is-armed');

  mount.appendChild(waveTitle(CFG.kicker));

  /* portal */
  var portal = el('section', 'ty1-portal');
  portal.id = 'portal';
  var ps = el('div', 'ty1-sticky');
  var disc = el('div', 'disc-3d');
  disc.setAttribute('aria-hidden', 'true');
  var sleeve = el('article', 'sleeve-card');
  sleeve.innerHTML = '<div class="badge">Tracklist / spec sheet</div><h3>' + CFG.sleeve.title + '</h3><p>' + CFG.sleeve.note + '</p>';
  var addSleeve = btn(CFG.sleeve.cta, 'ty1-btn');
  addSleeve.addEventListener('click', function () { addItem(CFG.sleeve.id, CFG.sleeve.title, CFG.sleeve.price); });
  sleeve.appendChild(addSleeve);
  ps.appendChild(disc); ps.appendChild(sleeve); portal.appendChild(ps);
  mount.appendChild(portal);

  /* menu */
  var menu = el('section', 'ty1-block');
  menu.id = 'menu';
  menu.appendChild(waveTitle(brand === 'deli' ? 'The butcher matrix' : 'The menu matrix'));
  var tabs = el('div', 'ty1-tabs');
  var grid = el('div', 'ty1-grid');
  CFG.cats.forEach(function (cat, idx) {
    var t = btn(cat);
    t.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
    t.addEventListener('click', function () {
      tabs.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      t.setAttribute('aria-pressed', 'true');
      grid.querySelectorAll('.ty1-cell').forEach(function (cell) {
        cell.hidden = cat !== 'ALL' && cell.getAttribute('data-cat') !== cat;
      });
    });
    tabs.appendChild(t);
  });
  CFG.items.forEach(function (item) {
    var cell = el('article', 'ty1-cell');
    cell.setAttribute('data-cat', item[2]);
    cell.innerHTML = '<div class="idx">' + item[1] + ' · ' + item[6] + '</div><h3>' + item[3] + '</h3><p>' + item[4] + '</p><strong>Rs ' + item[5] + '</strong>';
    var qty = el('div', 'ty1-qty');
    var minus = btn('-'); var plus = btn('+');
    var num = el('span'); num.setAttribute('data-ty1-qty', item[0]); num.textContent = '0';
    minus.addEventListener('click', function () { changeQty(item[0], -1); });
    plus.addEventListener('click', function () { addItem(item[0], item[3], item[5]); });
    qty.appendChild(minus); qty.appendChild(num); qty.appendChild(plus);
    cell.appendChild(qty);
    grid.appendChild(cell);
  });
  menu.appendChild(tabs); menu.appendChild(grid);
  mount.appendChild(menu);

  var splitWrap = el('section', 'ty1-block');
  var split = el('div', 'ty1-split');
  split.innerHTML = '<div><p class="plane-kicker">Manifesto</p><h3 style="font-family:Syne,sans-serif;font-size:clamp(2rem,5vw,3.4rem);letter-spacing:-.04em">' +
    (brand === 'deli' ? '0 to 4 C from the cold room to the table.' : 'Ten seats. The drink in front of you is the point.') +
    '</h3></div><div><p>Live specs stay on the corridor HUD. The bag is the same drawer this page already uses.</p></div>';
  splitWrap.appendChild(split);
  var show = el('div', 'ty1-show');
  CFG.boxes.forEach(function (box) {
    var card = el('article', '', '<h3>' + box[0] + '</h3><p>' + box[1] + '</p><strong>Rs ' + box[2] + '</strong>');
    var b = btn(brand === 'deli' ? '+ Reserve box' : '+ Add to bag', 'ty1-btn');
    b.addEventListener('click', function () { addItem(box[3], box[0], box[2]); });
    card.appendChild(b);
    show.appendChild(card);
  });
  splitWrap.appendChild(show);
  var marquee = el('div', 'ty1-marquee');
  marquee.innerHTML = '<div class="track"><span>' + CFG.ticker + '</span><span>' + CFG.ticker + '</span></div>';
  mount.appendChild(splitWrap);
  mount.appendChild(marquee);

  /* fan + blueprint */
  var drops = el('section', 'ty1-block');
  drops.id = 'drops';
  drops.appendChild(waveTitle(brand === 'deli' ? 'Curing vault' : 'Drops'));
  var fan = el('div', 'ty1-fan');
  var active = 0;
  CFG.drops.forEach(function (d, i) {
    var c = el('article', '', '<div class="idx">0' + (i + 1) + '</div><h3>' + d[0] + '</h3><p>' + d[1] + '</p>');
    c.addEventListener('click', function () { active = i; });
    fan.appendChild(c);
  });
  var readout = el('p', 'ty1-readout', CFG.drops[0][0]);
  var nav = el('div', 'ty1-tabs');
  var prev = btn('Prev', 'ty1-navbtn'); var next = btn('Next', 'ty1-navbtn');
  prev.addEventListener('click', function () { active = (active + CFG.drops.length - 1) % CFG.drops.length; });
  next.addEventListener('click', function () { active = (active + 1) % CFG.drops.length; });
  nav.appendChild(prev); nav.appendChild(next);
  drops.appendChild(fan); drops.appendChild(nav); drops.appendChild(readout);
  mount.appendChild(drops);

  var tele = el('section', 'ty1-block');
  tele.id = 'telemetry';
  tele.appendChild(waveTitle(brand === 'deli' ? 'Cold-chain telemetry' : 'Craft telemetry'));
  var blue = el('div', 'ty1-blue');
  blue.appendChild(el('div', 'ty1-hub', brand === 'deli' ? 'DC' : 'GSC'));
  CFG.nodes.forEach(function (n, i) {
    var node = el('div', 'ty1-node', n[0]);
    node.style.left = n[1]; node.style.top = n[2];
    node.dataset.depth = String(1.2 + (i % 3) * 0.4);
    blue.appendChild(node);
  });
  tele.appendChild(blue);
  mount.appendChild(tele);

  var visit = el('section', 'ty1-curtain');
  visit.id = 'visit';
  var sheet = el('div', 'sheet');
  sheet.innerHTML = '<p class="plane-kicker" id="ty1Open">Hours</p><h2 class="ty1-wave" data-wave-title style="font-size:clamp(2.4rem,7vw,5rem)">' + CFG.visitTitle + '</h2><p>' + CFG.visitBody + '</p>';
  var stats = el('div', 'ty1-stats');
  stats.innerHTML = '<div><b>Local time</b><span id="ty1Clock">--</span></div><div><b>Counter</b><span>' + (brand === 'deli' ? 'Delhi NCR' : 'Gurugram') + '</span></div><div><b>Concierge</b><span>' + (brand === 'deli' ? '+91 98100 02023' : '+91 81300 56889') + '</span></div><div><b>Fulfilment</b><span>' + (brand === 'deli' ? 'Cold van, code WoW20' : 'Roasted to order') + '</span></div>';
  sheet.appendChild(stats);
  visit.appendChild(sheet);
  mount.appendChild(visit);

  /* commerce bridge */
  function addItem(id, name, price) {
    window.TY1_EXTRAS = window.TY1_EXTRAS || [];
    if (!window.TY1_EXTRAS.some(function (p) { return p.id === id; })) {
      window.TY1_EXTRAS.push({ id: id, name: name, price: price, weight: 'pack' });
    }
    if (brand === 'deli' && typeof addToBasket === 'function') addToBasket(id);
    else if (typeof window.addToCart === 'function') window.addToCart(id);
  }
  function changeQty(id, delta) {
    if (delta > 0) return;
    if (brand === 'deli' && typeof changeQty === 'function') {
      /* deli changeQty is index based; the pill minus just no-ops into the drawer */
    }
    if (brand === 'gram' && typeof window.removeCartItem === 'function') {
      /* remove last matching by opening the bag; quantity lives in the drawer */
    }
    var bag = brand === 'deli' ? (window.__deliBasket || null) : null;
    if (typeof window.removeCartItem === 'function' && brand === 'gram') {
      /* handled in drawer */
    }
  }

  /* audio */
  var actx = null, noise = null, playing = false, muted = false;
  function bed() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
    var rate = actx.sampleRate;
    var buffer = actx.createBuffer(1, rate, rate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < data.length; i++) {
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 0.4;
    }
    noise = actx.createBufferSource();
    noise.buffer = buffer; noise.loop = true;
    var filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = brand === 'deli' ? 280 : 520;
    var gain = actx.createGain();
    gain.gain.value = 0.03;
    noise.connect(filter); filter.connect(gain); gain.connect(actx.destination);
    noise.start();
    playing = true;
  }
  document.getElementById('ty1Play').addEventListener('click', function () {
    if (!playing) { bed(); this.textContent = 'Playing'; }
    else if (actx) { actx.suspend(); playing = false; this.textContent = brand === 'deli' ? 'Atelier ambience' : 'Cafe soundscape'; }
  });
  document.getElementById('ty1Mute').addEventListener('click', function () {
    muted = !muted;
    if (actx) actx.destination.channelCount; 
    if (muted && actx && actx.state === 'running') actx.suspend();
    if (!muted && playing && actx) actx.resume();
    this.textContent = muted ? 'Live' : 'Mute';
  });

  /* observers */
  var liveBits = mount.querySelectorAll('.ty1-marquee, .ty1-walk, .ty1-portal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('in-view', en.target.classList.contains('ty1-marquee') && en.isIntersecting); });
    }, { threshold: 0.05 });
    mount.querySelectorAll('.ty1-marquee').forEach(function (n) { io.observe(n); });
  }
  void liveBits;

  var waves = [].slice.call(mount.querySelectorAll('[data-wave-title]'));
  var planes = [].slice.call(stage.children);
  var bars = [].slice.call(audio.querySelectorAll('.ty1-eq i'));
  var fanCards = [].slice.call(fan.children);
  var nodes = [].slice.call(blue.querySelectorAll('.ty1-node'));
  var progressBar = document.getElementById('walkProgressBar');
  var progressLab = document.getElementById('walkProgressLabel');
  var lastPct = -1;
  var metrics = [];
  function measure() {
    metrics = [walk, portal, visit].map(function (sec) {
      return { el: sec, top: sec.offsetTop, h: sec.offsetHeight };
    });
  }
  measure();
  window.addEventListener('resize', measure);

  var targetScroll = 0, currentScroll = 0, mouseX = 0, mouseY = 0, tmx = 0, tmy = 0;
  var waving = false;
  window.addEventListener('pointermove', function (e) {
    tmx = (e.clientX / window.innerWidth) * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function progress(sec) {
    var span = sec.h - window.innerHeight;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, (currentScroll - sec.top) / span));
  }

  function frame(now) {
    targetScroll = window.scrollY;
    var ease = reduce ? 1 : 0.11;
    currentScroll += (targetScroll - currentScroll) * ease;
    var velocity = targetScroll - currentScroll;
    var waveAmt = reduce ? 0 : Math.min(1, Math.abs(velocity) / 95);
    mouseX += (tmx - mouseX) * 0.08;
    mouseY += (tmy - mouseY) * 0.08;

    var wp = progress(metrics[0]);
    var zTravel = wp * 3400;
    for (var i = 0; i < planes.length; i++) {
      var z0 = +planes[i].dataset.z0;
      var z = z0 + zTravel;
      var fade = 1;
      if (z > 180) fade = Math.max(0, 1 - (z - 180) / 420);
      else if (z < -3200) fade = Math.max(0, Math.min(1, (z + 3800) / 600));
      var depth = +planes[i].dataset.depth || 12;
      planes[i].style.transform = 'translate3d(calc(-50% + ' + (mouseX * depth).toFixed(1) + 'px), calc(-50% + ' + (mouseY * depth).toFixed(1) + 'px), ' + z.toFixed(1) + 'px) rotateX(' + (-mouseY * 2.5).toFixed(2) + 'deg) rotateY(' + (mouseX * 3.5).toFixed(2) + 'deg)';
      planes[i].style.opacity = fade.toFixed(3);
    }
    var pct = Math.round(wp * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      progressBar.style.width = pct + '%';
      progressLab.textContent = pct + '% DEPTH';
    }

    if (waveAmt > 0.01) {
      waving = true;
      if (disp) disp.setAttribute('scale', (waveAmt * 18).toFixed(1));
      for (var w = 0; w < waves.length; w++) {
        if (waves[w].style.filter !== 'url(#freq-wave-filter)') waves[w].style.filter = 'url(#freq-wave-filter)';
        var chars = waves[w].children;
        for (var c = 0; c < chars.length; c++) {
          var phase = currentScroll * 0.02 + c * 0.55;
          var scaleY = 1 + Math.sin(phase) * waveAmt * 0.28;
          var shiftY = Math.cos(phase) * waveAmt * -10;
          chars[c].style.transform = 'translate3d(0,' + shiftY.toFixed(1) + 'px,0) scaleY(' + scaleY.toFixed(3) + ')';
        }
      }
    } else if (waving) {
      waving = false;
      if (disp) disp.setAttribute('scale', '0');
      for (var r = 0; r < waves.length; r++) {
        waves[r].style.filter = 'none';
        var kids = waves[r].children;
        for (var k = 0; k < kids.length; k++) kids[k].style.transform = 'none';
      }
    }

    var pp = progress(metrics[1]);
    var rot = pp * 720;
    var sc = 0.68 + Math.min(1, pp / 0.45) * 0.5;
    disc.style.transform = 'rotate(' + rot.toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
    if (pp > 0.38) document.body.dataset.world = CFG.world;
    else if (document.body.dataset.world) delete document.body.dataset.world;
    var sleeveX = pp < 0.55 ? 40 : 40 - ((pp - 0.55) / 0.45) * 68;
    sleeve.style.translate = sleeveX.toFixed(1) + '% -50%';

    for (var f = 0; f < fanCards.length; f++) {
      var offset = f - active;
      fanCards[f].style.transform = 'translate3d(' + (offset * 150) + 'px,' + (Math.abs(offset) * 22) + 'px,' + (Math.abs(offset) * -70) + 'px) rotateZ(' + (offset * 7) + 'deg)';
      fanCards[f].style.zIndex = String(10 - Math.abs(offset));
    }
    readout.textContent = CFG.drops[active][0];

    for (var n = 0; n < nodes.length; n++) {
      var d = +nodes[n].dataset.depth;
      nodes[n].style.translate = (mouseX * d * 8).toFixed(1) + 'px ' + (mouseY * d * 8).toFixed(1) + 'px';
    }

    var vp = progress(metrics[2]);
    sheet.style.setProperty('--curtain', vp.toFixed(3));

    if (playing && !muted) {
      for (var b = 0; b < bars.length; b++) {
        var h = 20 + Math.abs(Math.sin(now / 180 + b)) * 80;
        bars[b].style.transform = 'scaleY(' + (h / 100).toFixed(3) + ')';
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function clock() {
    try {
      var fmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
      var parts = fmt.formatToParts(new Date());
      var hh = +parts.filter(function (p) { return p.type === 'hour'; })[0].value;
      var mm = parts.filter(function (p) { return p.type === 'minute'; })[0].value;
      var open = hh + (+mm / 60) >= CFG.hours[0] && hh + (+mm / 60) < CFG.hours[1];
      var lab = document.getElementById('ty1Open');
      var clk = document.getElementById('ty1Clock');
      if (lab) lab.textContent = open ? 'Open now, IST' : 'Closed, IST';
      if (clk) clk.textContent = hh + ':' + mm + ' IST';
    } catch (e) {}
  }
  clock();
  setInterval(clock, 60000);

  if (typeof window.updateCartUI === 'function') window.updateCartUI();
  if (typeof updateBasketUI === 'function') updateBasketUI();
})();

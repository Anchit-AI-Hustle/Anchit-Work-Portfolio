import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { tidy } from './xazina-tidy.mjs';

const B='/xazina-revamp', ORIGIN='https://xazina.com', LIVE='https://anchit-tandon.com';
const JOURNAL='/blogs/lab-grown-diamond-journal-by-xazina';
const COLLECTION='/collections/all';
const FALLBACK=B+'/media/act-form.webp';
const ART={jewellery:B+'/media/maison-cover.webp',journal:B+'/media/act-spectrum.webp',atelier:B+'/media/atelier.webp',fragrance:B+'/media/perfume.webp'};
const VERSION='maison-4';
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const plain=value=>String(value??'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
const local=path=>B+(path==='/'?'':path);
// 372 of 436 prices carry paise and the rest are whole rupees, which
// maximumFractionDigits alone printed as "₹1,48,756.00". Paise show only when
// a price really has them.
const money=value=>{const paise=Math.round(Number(value)*100);return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:paise%100?2:0,maximumFractionDigits:2}).format(paise/100);};
// Same words and links on all three storefront concepts. Neutral chrome.
const CONCEPT_BAR='<div class="concept-bar" role="note"><p>Independent design concept by <a href="/">Anchit Tandon</a>, not affiliated with Xazina. Xazina handles purchases and appointments; prices are a catalog snapshot.</p><nav aria-label="About this concept"><a href="/">Portfolio</a><a href="/xazina-revamp/#design-notes">Design notes</a><a href="/assets/resume.pdf">Resume</a><a href="mailto:anchit.tandon@gmail.com?subject=Your%20Xazina%20concept">Email Anchit</a></nav></div>';
// 429 of 436 products carry no type, so 429 cards wore the same "Xazina
// jewellery" eyebrow. A card now names the piece's smallest (most specific)
// collection, the same order "More from Xazina" uses. Collections that name a
// placement on the old site rather than a kind of piece are passed over.
const PLACEMENT=/home page|inspired page|^learn more$|^find your|^all collections$|^craftsmanship$|^best sellers$/i;
const tidyTitle=t=>{const x=String(t).trim().replace(/\s*\/\s*/g,' / ');return x===x.toUpperCase()||x===x.toLowerCase()?x.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()):x;};
let EYEBROW=new Map();
function eyebrows(snapshot){
 const cols=Object.values(snapshot.entries).filter(e=>e.kind==='collection'&&e.path!=='/collections/all'&&e.members?.length&&!PLACEMENT.test(e.title.trim())).sort((a,b)=>a.members.length-b.members.length);
 const map=new Map();
 for(const c of cols)for(const m of c.members)if(!map.has(m))map.set(m,tidyTitle(c.title));
 return map;
}
const eyebrow=p=>EYEBROW.get(p.path)||(p.type?tidyTitle(p.type):'Xazina jewellery');
const icon=(name,cls='')=>`<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
const icons=`<svg class="svg-defs" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs>
<symbol id="shop-arrow" viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6"/></symbol>
<symbol id="shop-external" viewBox="0 0 24 24"><path d="M5 19 19 5M9 5h10v10"/></symbol>
<symbol id="shop-spark" viewBox="0 0 24 24"><path d="M12 1c0 7-4 11-11 11 7 0 11 4 11 11 0-7 4-11 11-11-7 0-11-4-11-11Z"/></symbol>
<symbol id="shop-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></symbol>
<symbol id="shop-bag" viewBox="0 0 24 24"><path d="M4 8h16l1 13H3L4 8Zm4 1V6a4 4 0 1 1 8 0v3"/></symbol>
</defs></svg>`;
function sized(url,w=900) {
  if(!url?.startsWith('https://'))return url||FALLBACK;
  const u=new URL(url);
  if(/\/(?:cdn\/shop|s\/files)\//.test(u.pathname))u.searchParams.set('width',w);
  return u.href;
}
const image=(src, alt='',w=900,eager=false)=>`<img src="${escape(sized(src,w))}" alt="${escape(alt)}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
const button=(href,label,style='gold',external=false)=>`<a class="shop-button ${style}" href="${escape(href)}">${escape(label)} ${icon(external?'shop-external':'shop-arrow')}</a>`;
function list(items){return items.map(([text,href])=>`<a href="${escape(href)}">${escape(text)}</a>`).join('');}
// The captured menu is flat: "Rings" and its "Solitaire" sit beside
// "Earrings" and its own "Solitaire", so For Her listed Solitaire twice with
// nothing to tell them apart. Category parents become sub-headings, their
// pieces sit under them, and "Explore ..." promos are set apart.
const MENU_PARENTS=new Set(['Rings','Earrings','Wrists','Neck']);
function menuLinks(links){
 let inGroup=false;
 return links.map(([text,href])=>{
  const cls=MENU_PARENTS.has(text)?(inGroup=true,'shop-mega-parent'):/^Explore /.test(text)?(inGroup=false,'shop-mega-explore'):inGroup?'shop-mega-child':'';
  return `<a href="${escape(href)}"${cls?` class="${cls}"`:''}>${escape(text)}</a>`;
 }).join('');
}
function header(snapshot, home=false){
 const groups=snapshot.menu.map(group=>`<section><h2><a href="${escape(group.href)}">${escape(group.title)}</a></h2>${menuLinks(group.links)}</section>`).join('');
 return `<header class="shop-header${home?' home-shop-header':''}"${home?' id="shop-navigation"':''} aria-label="Xazina storefront">
 <div class="shop-top shop-wrap"><a class="shop-mark" href="${B}" aria-label="Xazina home">XAZINA<span>✧</span></a>
 <nav class="shop-nav" aria-label="Shop and discover"><a href="${local(COLLECTION)}">Jewellery</a><a href="${local('/collections/fragrances')}">Fragrance</a><a href="${local('/pages/customise-jewellery')}">Atelier</a><a href="${local(JOURNAL)}">Journal</a></nav>
 <div class="shop-tools"><a href="${local('/search')}" aria-label="Search">${icon('shop-search')}</a><a href="${local('/cart')}" aria-label="Shopping bag">${icon('shop-bag')}<span data-bag-count hidden>0</span></a><details class="shop-menu"><summary aria-label="Open full menu">Menu <span>+</span></summary><div class="shop-mega"><div class="shop-wrap shop-mega-grid">${groups}<section><h2>Explore</h2>${list([['All products',local(COLLECTION)],['Journal',local(JOURNAL)],['The Light Study',B],['Account',local('/account')]])}</section></div></div></details></div>
 </div></header>`;
}
function footer(snapshot){
 return `<footer class="shop-footer"><div class="shop-wrap">
 <div class="shop-foot-lead"><div><a href="${B}" class="shop-mark">XAZINA<span>✧</span></a><p>Pronounced Kuh-zeena.</p></div>
 <div><h2>The Xazina list.</h2><p>New arrivals and exclusive offers, from the original house.</p>${button(ORIGIN+'/#LfdNewsletterForm','Subscribe on Xazina','glass',true)}</div></div>
 <div class="shop-foot-grid">${snapshot.footer.map(group=>`<section><h3>${escape(group.title==='Subscribe'?'Client care':group.title)}</h3>${list(group.links)}${group.title==='Subscribe'?'<a href="tel:+919090295050">+91 9090295050</a><p>Tuesday to Sunday<br>11:00 AM to 8:00 PM</p>':''}</section>`).join('')}
 <section><h3>Discover</h3>${list([['All jewellery',local(COLLECTION)],['Fragrance',local('/collections/fragrances')],['All collections',local('/collections')],['Search the site',local('/search')],['Light Lab',B+'#light-lab'],['Shopping bag',local('/cart')],['Account',local('/account')]])}</section></div>
 <div class="shop-social"><p class="shop-kicker">Follow Xazina</p>${list(snapshot.social||[])}</div>
 <div class="shop-foot-end"><p>Independent design concept by <a href="/">Anchit Tandon</a>. Xazina handles purchases and appointments.</p><a href="#top">Back to top ↑</a></div></div></footer>`;
}
function crumb(path,title){
 const part=path.split('/')[1];
 const parent=({products:['Jewellery',local(COLLECTION)],collections:['Collections',local('/collections')],pages:['The House',local('/pages')],blogs:['Journal',local(JOURNAL)],policies:['Client care',local('/policies')]})[part];
 return `<nav class="shop-crumb" aria-label="Breadcrumb"><a href="${B}">Xazina</a>${parent && parent[1]!==local(path)?`<span>/</span><a href="${parent[1]}">${parent[0]}</a>`:''}<span>/</span><span aria-current="page">${escape(title)}</span></nav>`;
}
// Search and share cards want 60-160 characters (scripts/seo-basics.js). The
// captured copy is either a whole product story (cut at 210, so 422 product
// pages failed) or a one-line account prompt (as short as 46).
const DESC_TAIL=' Lab-grown diamond jewellery and fine fragrance from the house of Xazina.';
function metaDescription(text){
 let d=plain(text);
 if([...d].length<60)d=(d?d.replace(/[\s.]*$/,'.'):'')+DESC_TAIL;
 d=d.trim();
 if([...d].length>160)d=[...d].slice(0,157).join('').replace(/[\s,;:.-]+\S*$/,'')+'…';
 return d;
}
// The captured "related" list held "Previous Post ..." and "Next Post ..."
// as raw text, plus a "Learn more" after every story that repeated the link
// just before it. Each story now appears once, under a plain label.
function relatedStories(links){
 const seen=new Set(), out=[];
 for(const [text,href] of links||[]){
  if(seen.has(href)||/^learn more$/i.test(text.trim()))continue;
  seen.add(href);
  const m=text.match(/^(Previous|Next) Post\s+(.*)$/i);
  out.push(m?[(m[1].toLowerCase()==='previous'?'← Previous: ':'Next: ')+m[2],href]:[text,href]);
 }
 if(!out.length)return '';
 return `<div class="shop-paper"><nav class="shop-wrap shop-section shop-related" aria-label="Related stories"><p class="shop-kicker">More from the journal</p>${list(out)}</nav></div>`;
}
function shell(snapshot,item,content) {
 const title=`${item.title} | Xazina`;
 const desc=metaDescription(item.description||item.excerpt||'Explore Xazina’s lab-grown diamond jewellery, fine fragrance and craft.');
 const extra=item.kind==='product'?'<meta property="og:type" content="product">':'';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
 <meta name="theme-color" content="#110c1c"><meta name="robots" content="noindex,follow"><title>${escape(title)}</title>
 <meta name="description" content="${escape(desc)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(desc)}">
 <meta property="og:image" content="${escape(item.image?sized(item.image):LIVE+FALLBACK)}"><link rel="canonical" href="${LIVE+local(item.path)}">${extra}
 <link rel="icon" href="${B}/media/mark.svg" type="image/svg+xml"><link rel="preload" href="${B}/media/serif.woff2" as="font" type="font/woff2" crossorigin>
 <link rel="stylesheet" href="${B}/style.css?v=prism-4"><link rel="stylesheet" href="${B}/shop.css?v=${VERSION}">
 <script defer src="/assets/vendor/xazina/motion.js"></script><script type="module" src="${B}/shop.js?v=${VERSION}"></script>
 </head><body class="shop-body" id="top" data-shop-kind="${escape(item.kind)}" data-shop-path="${escape(item.path)}">
 <a class="skip" href="#shop-main">Skip to content</a>${CONCEPT_BAR}${icons}${header(snapshot)}
 <main id="shop-main">${content}</main>${footer(snapshot)}</body></html>`;
}
function hero(item,kicker,options={}) {
 const photo=item.image||options.photo||ART.jewellery;
 const desc=options.desc;
 const data=options.cover?' data-cover="true"':'';
 return `<section class="shop-cover"${data}>${image(photo,'',1600,true)}<div class="shop-wrap shop-cover-inner">${crumb(item.path,item.title)}
 <div class="shop-cover-copy"><p class="shop-kicker">${icon('shop-spark')} ${escape(kicker)}</p><h1>${escape(item.title)}</h1>${desc?`<p class="shop-lede">${escape(desc)}</p>`:''}${options.action||''}</div><span class="shop-cover-note">THE HOUSE OF XAZINA / ${escape(kicker.toUpperCase())}</span></div></section>`;
}
function productCard(p) {
 if(!p)return '';
 return `<article class="shop-card" data-card data-title="${escape(p.title.toLowerCase())}" data-price="${p.price??0}" data-available="${p.available?'yes':'no'}">
 <a href="${local(p.path)}"><div class="shop-card-image">${image(p.image,p.images?.[0]?.alt||p.title,680)}<span>${icon('shop-arrow')}</span></div>
 <div class="shop-card-text"><p class="shop-kicker">${escape(eyebrow(p))}</p><h2>${escape(p.title)}</h2>${p.price!==null?`<p>From ${money(p.price)}</p>`:''}</div></a></article>`;
}
const storyDate=d=>{const t=new Date(d);return isNaN(t)?'':t.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});};
function routeCard(p) {
 return `<article class="shop-card shop-editor-card" data-card data-title="${escape(p.title.toLowerCase())}" data-price="0" data-available="yes"><a href="${local(p.path)}">
 <div class="shop-card-image">${image(p.image||ART[p.kind==='article'?'journal':'jewellery'],'',720)}<span>${icon('shop-arrow')}</span></div>
 <div class="shop-card-text"><p class="shop-kicker">${escape(p.kind==='article'?(p.date?'Journal · '+storyDate(p.date):'The Xazina journal'):p.kind==='collection'?'Curated collection':'The house')}</p><h2>${escape(p.title)}</h2></div></a></article>`;
}
function grid(cards,kicker='The edit',count=cards.length,filters=true){
 return `<section class="shop-paper"><div class="shop-wrap shop-section">
 <div class="shop-list-head"><div><p class="shop-kicker">${escape(kicker)}</p><h2>Discover the edit.</h2><p data-result-count aria-live="polite">${count} ${count===1?'result':'results'}</p></div>
 ${filters?`<div class="shop-filters" data-filters><label>Find within this edit <input type="search" placeholder="Filter by name" data-filter-query></label>
 <label>Sort by <select data-filter-sort><option value="original">Featured</option><option value="az">Name A to Z</option><option value="price-up">Price: low to high</option><option value="price-down">Price: high to low</option></select></label><label class="shop-check"><input type="checkbox" data-filter-stock> In stock</label></div>`:''}</div>
 <div class="shop-grid" data-grid>${cards.join('')}</div>
 <p class="shop-empty" data-filter-empty ${count?'hidden':''}>${count?'No results match those filters. <button type="button" class="shop-link-button" data-filter-clear>Clear filters</button>':'This edit has no listed items.'}</p>
 </div></section>`;
}
// "08 / XAZINA" said nothing. Every block is labelled with its section
// title, so a run of photos still says what it is, and so do the home's
// blocks, which all carry a heading and so all read "XAZINA" before.
function label(b){
 const title=plain(b.title);
 return title?title.toUpperCase().slice(0,48):'XAZINA';
}
function blocks(items,extra='') {
 if(!items?.length)return '';
 return `<div class="shop-paper shop-source ${extra}"><div class="shop-wrap shop-section">${items.map((b,i)=>`<section class="source-block" data-source-block><span class="source-number">${String(i+1).padStart(2,'0')} / ${escape(label(b))} ${icon('shop-spark')}</span><div class="source-content">${tidy(b.html)}</div></section>`).join('')}</div></div>`;
}
function originLink(item,label='View original on Xazina'){return button(ORIGIN+item.path,label,'glass',true);}
function unavailable(item,label){
 return `<section class="shop-dark shop-wrap shop-section"><p class="shop-kicker">From the original house</p><h2>${escape(label)}</h2><p>The complete source content is available on the official Xazina site.</p>${originLink(item)}</section>`;
}
function product(snapshot,p){
 const first=p.variants.find(v=>v.available)||p.variants[0];
 const images=p.images.length?p.images:[{url:p.image,alt:p.title}];
 const featured=images[0];
 // 429 of 436 products carry no type, so matching on type alone left almost
 // every product page without "More from Xazina". The pieces it shares a
 // collection with fill in, smallest (most specific) collection first.
 let related=Object.values(snapshot.products).filter(x=>x.path!==p.path&&x.type&&x.type===p.type).slice(0,4);
 if(related.length<4){
  const homes=Object.values(snapshot.entries).filter(e=>e.kind==='collection'&&e.members?.includes(p.path)&&e.path!=='/collections/all').sort((a,b)=>a.members.length-b.members.length);
  for(const c of homes)for(const m of c.members){
   const x=snapshot.products[m];
   if(related.length<4&&x&&x.path!==p.path&&!related.includes(x))related.push(x);
  }
 }
 const escapedData=JSON.stringify({path:p.path,title:p.title,images,variants:p.variants}).replace(/</g,'\\u003c');
 return `<section class="shop-product"><div class="shop-wrap">${crumb(p.path,p.title)}
 <div class="shop-product-layout">
 <div class="shop-gallery" data-gallery><button type="button" class="shop-main-image" aria-label="Open full-size product photo">${image(featured.url,featured.alt||p.title,1200,true)}<span>${icon('shop-external')} View detail</span></button>
 ${images.length>1?`<div class="shop-thumbs" aria-label="Product photos">${images.map((im,i)=>`<button type="button" data-gallery-index="${i}" aria-pressed="${i===0}" aria-label="View product photo ${i+1}">${image(im.url,'',240)}</button>`).join('')}</div>`:''}</div>
 <div class="shop-product-copy"><p class="shop-kicker">${icon('shop-spark')} ${escape(eyebrow(p))}</p><h1>${escape(p.title)}</h1>
 <p class="shop-price" data-variant-price>${first?money(first.price):''}</p><p class="shop-availability" data-variant-status>${first?.available?'In stock on Xazina':'Currently unavailable'}</p>
 <form class="shop-variant" data-variant-form>
 ${p.options.map((o,i)=>`<label>${escape(o.name)}<select data-option="${i}">${o.values.map(value=>`<option${value===first?.options[i]?' selected':''}>${escape(value)}</option>`).join('')}</select></label>`).join('')}
 <label>Quantity <input type="number" data-quantity min="1" max="20" value="1" inputmode="numeric"></label>
 <button class="shop-button gold" type="submit" data-add ${first?.available?'':'disabled'}>Add to bag ${icon('shop-bag')}</button><p role="status" data-add-status></p></form>
 ${originLink(p,'View on Xazina')}${button(local('/pages/contact-xazina'),'Speak to the atelier','glass')}
 <p class="shop-small">Prices and availability are a catalog snapshot. Xazina confirms both at checkout.</p>
 <nav class="shop-product-guide" aria-label="Fit and delivery"><a href="${local('/pages/size-guide')}">Size guide</a><a href="${local('/policies/shipping-policy')}">Shipping</a><a href="${local('/policies/refund-policy')}">Returns</a></nav>
 </div></div></div></section>
 <section class="shop-paper"><div class="shop-wrap shop-section shop-details"><div><p class="shop-kicker">Craft notes</p><h2>The details.</h2></div><div class="source-content">${tidy(p.description)||'<p>Explore the original listing for product details.</p>'}</div></div></section>
 ${related.length?grid(related.map(productCard),'More from Xazina',related.length,false):''}
 <dialog class="shop-lightbox" data-lightbox><button type="button" data-close-photo aria-label="Close product photo">Close ×</button><img alt=""></dialog>
 <script type="application/json" id="product-data">${escapedData}</script>`;
}
function display(snapshot,item) {
 const {products,entries}=snapshot;
 const all=Object.values(entries);
 if(item.kind==='product')return product(snapshot,item);
 if(item.kind==='collection'){
  const collectionLinks=snapshot.menu.slice(0,6).map(x=>[x.title,x.href]);
  const img=item.image|| (item.path.includes('fragrance')?ART.fragrance:ART.jewellery);
  const children=item.members.map(p=>products[p]).filter(Boolean);
  // 35 captured collections list no products of their own; their pieces live
  // in the curated blocks below. They used to open on "0 pieces in this edit"
  // and an empty, filterable grid, which read as a broken page.
  const empty=item.captured&&!children.length;
  return hero({...item,image:img},'The collection',{desc:plain(item.description).slice(0,190)||(empty?'A curated edit from the house of Xazina.':`${item.count} pieces in this edit.`),action:`<a class="shop-cover-action" href="#collection-edit">Shop the collection ${icon('shop-arrow')}</a>`})
   +`<nav class="shop-ribbon" id="collection-edit" aria-label="Collections"><div class="shop-wrap">${list(collectionLinks)}<a href="${local('/collections')}">All collections</a></div></nav>`
   +(empty?'':item.captured?grid(children.map(productCard),'The collection',children.length):unavailable(item,'Explore this collection on Xazina.'))
   +(item.description?`<section class="shop-paper shop-wrap-wide"><div class="shop-wrap shop-section shop-details"><div><p class="shop-kicker">From the house</p><h2>About the edit.</h2></div><div class="source-content">${tidy(item.description)}</div></div></section>`:'')
   +blocks(item.blocks);
 }
 if(item.kind==='journal'||item.kind==='tag'){
  const articles=all.filter(e=>e.kind==='article'&&(item.kind!=='tag'||e.tags?.includes(item.tag))).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return hero(item,'The journal',{photo:ART.journal,desc:'Stories, styling notes and guides from the house of Xazina.'})+grid(articles.map(routeCard),'The journal',articles.length,true)+blocks(item.blocks);
 }
 if(item.kind==='article'){
  return hero(item,'The journal',{photo:ART.journal,desc:item.description,cover:true})
    +(item.content?`<section class="shop-paper"><div class="shop-wrap shop-section shop-article"><aside><p class="shop-kicker">The Xazina journal</p>${item.date?`<p><time datetime="${escape(item.date.slice(0,10))}">${escape(storyDate(item.date))}</time></p>`:''}${button(local(JOURNAL),'All stories','dark')}</aside><article class="source-content">${tidy(item.content)}</article></div></section>`:unavailable(item,'Read the full story on Xazina.'))
    +relatedStories(item.related);
 }
 if(item.kind==='search')return hero(item,'Find something brilliant',{photo:ART.journal,desc:'Search products, collections, guides and journal stories.'})+
  `<section class="shop-paper"><div class="shop-wrap shop-section"><form class="shop-search" data-search><label for="q">Search Xazina</label><div><input id="q" name="q" type="search" placeholder="Try emerald, fragrance or size guide" required><button class="shop-button dark">Search ${icon('shop-search')}</button></div></form><p class="shop-search-status" role="status" data-search-status>Enter a term to explore the catalog.</p><div class="shop-grid" data-search-results></div></div></section>`;
 if(item.kind==='cart')return hero(item,'The shopping bag',{photo:ART.jewellery,desc:'Review your selection before continuing to Xazina’s official checkout.'})+
  `<section class="shop-paper"><div class="shop-wrap shop-section shop-bag" data-bag><p>Your bag is empty.</p>${button(local(COLLECTION),'Explore jewellery','dark')}</div></section>`;
 if(item.kind==='retired')return hero(item,'From the archive',{photo:ART.jewellery,desc:'This link no longer has a live page on the original store.',action:button(local('/collections'),'Browse current collections')});
 if(item.kind==='handoff')return hero(item,'Client services',{photo:ART.atelier,desc:item.description,action:button(item.target,item.cta,'gold',true)});
 if(item.kind==='directory'){
  const dir=item.path==='/collections'?'collection':item.path==='/policies'?'policy':'page';
  const data=all.filter(x=>x.kind===dir);
  return hero(item,'Discover Xazina',{photo:ART.jewellery})+grid(data.map(routeCard),item.title,data.length,true);
 }
 const photo=item.kind==='policy'?ART.journal:item.path.includes('customise')?ART.atelier:ART.jewellery;
 return hero(item,item.kind==='policy'?'Client care':'The house',{photo,desc:item.description,cover:true})
  +(item.blocks?.length?blocks(item.blocks,item.kind==='policy'?'shop-policy':''):unavailable(item,'Explore the complete page on Xazina.'));
}
function utility(){
 return [
 {path:'/collections',title:'The collections',kind:'directory'},
 {path:'/pages',title:'The house',kind:'directory'},
 {path:'/policies',title:'Client care',kind:'directory'},
 {path:'/search',title:'Find your light.',kind:'search'},
 {path:'/cart',title:'Your shopping bag.',kind:'cart'},
 ...[
 ['/account','Your Xazina account.','Sign in to view your orders and manage your Xazina account.','Continue to Xazina account','/account'],
 ['/account/login','Sign in.','Use Xazina’s secure account portal to sign in.','Continue to sign in','/account/login'],
 ['/account/register','Create an account.','Complete account setup on Xazina’s official store.','Continue to Xazina','/account/register'],
 ['/account/orders','Your orders.','Find your purchases in Xazina’s official account portal.','View orders on Xazina','/account'],
 ['/checkout','Secure checkout.','Payment, tax, delivery and current availability are handled by Xazina.','Continue to Xazina','/cart'],
 ['/contact','Contact the house.','Speak with Xazina’s team to book an appointment or ask a question.','Contact Xazina','/pages/contact-xazina'],
 ].map(([path,title,description,cta,dest])=>({path,title,description,cta,target:ORIGIN+dest,kind:'handoff'}))
 ];
}
export async function buildXazina(www,source){
 const file=join(source,'xazina-revamp','catalog','snapshot.json');
 if(!existsSync(file))return;
 const snapshot=JSON.parse(await readFile(file,'utf8'));
 const output=join(www,'xazina-revamp');
 const all=[...Object.values(snapshot.products),...Object.values(snapshot.entries),...utility()];
 const known=new Set(all.map(x=>x.path));
 const pathOK=path=>/^\/(?:[a-z0-9._~-]+\/?)+$/i.test(path)&&!path.split('/').some(part=>part==='.'||part==='..');
 if(all.some(x=>!pathOK(x.path)))throw Error('Invalid Xazina route in source snapshot');
 if(known.size!==all.length)throw Error('Duplicate Xazina route in source snapshot');
 async function out(path,body){
  if(!pathOK(path))throw Error('Invalid output route '+path);
  const file=join(output,path.slice(1)+'.html');
  await mkdir(dirname(file),{recursive:true});await writeFile(file,body);
 }
 EYEBROW=eyebrows(snapshot);
 for(const item of all)await out(item.path,shell(snapshot,item,display(snapshot,item)));
 const search=all.filter(x=>!['directory','handoff','cart','search','policy','retired'].includes(x.kind)).map(x=>({title:x.title,path:x.path,kind:x.kind,image:x.image||'',price:x.price,tags:x.tags||[],type:x.type||'',...(x.kind==='product'?{eyebrow:eyebrow(x)}:{})}));
 await writeFile(join(output,'catalog','search.json'),JSON.stringify(search));
 await writeFile(join(output,'catalog','route-map.json'),JSON.stringify({...snapshot.inventory,routes:all.map(x=>({path:x.path,kind:x.kind,captured:x.captured??true}))}));
 await import('node:fs/promises').then(fs=>fs.unlink(join(output,'catalog','snapshot.json')));
 const aliases={'/blogs':JOURNAL,...snapshot.inventory.redirects};
 let forwarded=0;
 for(const [path,dest] of Object.entries(aliases)){
  if(known.has(path)||!pathOK(path)||(!known.has(dest)&&dest!=='/'))continue;
  const destination=local(dest);
  await out(path,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escape(destination)}"><link rel="canonical" href="${LIVE+destination}"><title>Continue to Xazina</title><meta name="description" content="This Xazina page has moved. Continue to its new address in the Xazina storefront concept."><meta property="og:image" content="${LIVE+FALLBACK}"><link rel="icon" href="${B}/media/mark.svg" type="image/svg+xml"><script type="module" src="${B}/shop-redirect.js"></script></head><body><a id="destination" href="${escape(destination)}">Continue to Xazina</a></body></html>`);
  forwarded++;
 }
 const home=join(output,'index.html');
 let html=await readFile(home,'utf8');
 // The home showed the same three pieces twice: unpriced near the top, then
 // priced in the captured "Our Most Loved" block. The priced list now fills
 // the first section and the captured duplicate is dropped from below.
 const loved=snapshot.home.find(b=>/^our most loved$/i.test(plain(b.title)));
 const lovedPieces=loved?[...new Set([...loved.html.matchAll(/href="\/xazina-revamp(\/products\/[^"#?]+)"/g)].map(m=>m[1]))].map(p=>snapshot.products[p]).filter(Boolean):[];
 const placed=lovedPieces.length>=2&&/data-most-loved>/.test(html);
 if(placed){
  const ownPhoto=new Map([...html.matchAll(/<a href="https:\/\/www\.xazina\.com(\/products\/[^"]+)">\s*<div class="piece-media">(<img [^>]+>)/g)].map(m=>[m[1],m[2]]));
  const cards=lovedPieces.map((p,i)=>{
   const photo=ownPhoto.get(p.path)||`<img src="${escape(sized(p.image,780))}" alt="${escape(p.images?.[0]?.alt||p.title)}" loading="lazy" decoding="async">`;
   const from=new Set(p.variants.map(v=>v.price)).size>1?'From ':'';
   return `          <article class="piece${i===0?' feature':''}" data-reveal>
            <a href="${local(p.path)}">
              <div class="piece-media">${photo}<span aria-hidden="true">${String(i+1).padStart(2,'0')}</span></div>
              <div class="piece-caption"><div><h3>${escape(p.title)}</h3><p>${escape(eyebrow(p))}</p><p class="piece-price">${from}${money(p.price)}</p></div><svg aria-hidden="true"><use href="#arrow"/></svg></div>
            </a>
          </article>`;
  }).join('\n');
  html=html.replace(/<div class="collection-grid" data-most-loved>[\s\S]*?(\n        <\/div>\n      <\/div>\n    <\/section>)/,(m,end)=>`<div class="collection-grid${lovedPieces.length===4?' most-loved':''}" data-most-loved>\n${cards}${end}`);
 }
 const homeBlocks=placed?snapshot.home.filter(b=>b!==loved):snapshot.home;
 const P=Object.values(snapshot.products), E=Object.values(snapshot.entries);
 // Numbers the design notes quote, counted from this build rather than typed.
 const facts={pages:all.length+forwarded+1,products:P.length,untyped:P.filter(p=>!p.type).length,collections:E.filter(e=>e.kind==='collection').length,articles:E.filter(e=>e.kind==='article').length};
 html=html.replace('</head>',`<meta name="robots" content="noindex,follow"><link rel="stylesheet" href="${B}/shop.css?v=${VERSION}"><script type="module" src="${B}/shop.js?v=${VERSION}"></script></head>`)
  .replace('<main id="main">',icons+'<main id="main">')
  .replace('</section>\n\n    <section class="jewellery','</section>\n'+header(snapshot,true)+'\n    <section class="jewellery')
  .replace('    <section class="notes light" id="design-notes"',`    <section id="original-edit" class="shop-home-source"><div class="shop-dark shop-wrap shop-section"><p class="shop-kicker">${icon('shop-spark')} THE XAZINA EDIT <span class="concept-tag">Kept from xazina.com</span></p><h2>From the house.</h2><p>Engagement rings, the collections, the Xazina promise and the original diamond guides: Xazina’s own home-page blocks, laid out for every screen.</p></div>${blocks(homeBlocks,'shop-home-blocks')}</section>\n\n    <section class="notes light" id="design-notes"`)
  .replace(/<span data-fact="(\w+)">[^<]*<\/span>/g,(m,k)=>k in facts?String(facts[k]):m)
  .replace(/<footer class="wrap footer">[\s\S]*?<\/footer>/,footer(snapshot))
  .replace(/href="https:\/\/(?:www\.)?xazina\.com([^"#?]*)"/g,(m,path)=>known.has(path)?`href="${local(path)}"`:m)
  .replace('</nav>\n          <a class="film-visit"','<a href="/xazina-revamp/collections">Shop all</a><a href="/xazina-revamp/blogs/lab-grown-diamond-journal-by-xazina">Journal</a></nav>\n          <a class="film-visit"')
  .replace('<a class="film-visit" href="https://www.xazina.com/">Visit Xazina <svg aria-hidden="true"><use href="#external"/></svg>','<a class="film-visit" href="#shop-navigation">Shop &amp; menu <svg aria-hidden="true"><use href="#down"/></svg>');
 if(!html.includes('id="original-edit"'))throw Error('Xazina home: the captured "From the house." section was not placed');
 await writeFile(home,html);
 console.log(`[xazina] ${all.length} themed routes and ${Object.keys(aliases).length} mapped aliases`);
}

const B='/xazina-revamp', STORE='https://xazina.com', KEY='xazina-bag-v1';
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(value);
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const el=(tag,text,classes)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(classes)node.className=classes;return node};
const href=path=>B+(path==='/'?'':path);
const asQuantity=value=>Math.max(1,Math.min(20,Math.floor(Number(value)||1)));
function imgUrl(src,width){
 if(!src)return B+'/media/act-form.webp';
 const u=new URL(src,location.origin);
 if(/\/(?:cdn\/shop|s\/files)\//.test(u.pathname))u.searchParams.set('width',width);
 return u.href;
}
function anchor(url,text,classes){
 const a=el('a',text,classes);a.href=url;return a;
}
function bag(){
 try {
  const data=JSON.parse(localStorage.getItem(KEY)||'[]');
  return Array.isArray(data)?data.filter(i=>/^\d+$/.test(i.id)&&/^\/products\/[\w-]+$/.test(i.path)&&Number.isFinite(i.price)&&i.price>=0&&i.qty>0):[];
 } catch{return [];}
}
function write(items){
 try{localStorage.setItem(KEY,JSON.stringify(items));return true;}catch{return false}
}
function counts(items=bag()){
 const count=items.reduce((n,item)=>n+asQuantity(item.qty),0);
 for(const badge of $$('[data-bag-count]')){badge.textContent=count;badge.hidden=count===0;}
 // The count was a visual badge only: "Shopping bag" was all a screen reader heard.
 for(const link of $$('a[href$="/cart"][aria-label]'))link.setAttribute('aria-label',count?`Shopping bag, ${count} ${count===1?'item':'items'}`:'Shopping bag');
}
counts();
addEventListener('storage',event=>{if(event.key===KEY){counts();renderBag();}});
for (const details of $$('.shop-menu')) {
 const close=event=>{if(details.open&&!details.contains(event.target))details.open=false;};
 document.addEventListener('click',close);
 details.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open){details.open=false;details.querySelector('summary').focus();}});
}

// "ring" must find rings, not the 110 earrings that contain the letters r-i-n-g.
// A term matches at the start of a word, so "ring" finds "Rings" and "ring"
// but not "Earring"; a plural or a longer word still matches its stem.
const esc=t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const wordStart=(text,term)=>new RegExp('(^|[^\\p{L}\\p{N}])'+esc(term),'iu').test(text);
const plural=(n,one,many)=>n+' '+(n===1?one:many);

for(const panel of $$('[data-filters]')){
 const section=panel.closest('.shop-section'), grid=$('[data-grid]',section), cards=$$('[data-card]',grid);
 const query=$('[data-filter-query]',panel),sort=$('[data-filter-sort]',panel),stock=$('[data-filter-stock]',panel);
 if(!cards.some(card=>+card.dataset.price>0)){
  stock.closest('label').hidden=true;
  for(const option of $$('option',sort))if(option.value.startsWith('price-'))option.remove();
 }
 const filter=()=>{
  const terms=query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const ordered=[...cards];
  if(sort.value==='az')ordered.sort((a,b)=>a.dataset.title.localeCompare(b.dataset.title));
  if(sort.value.startsWith('price-')){
   const dir=sort.value==='price-up'?1:-1;
   ordered.sort((a,b)=>(+a.dataset.price-+b.dataset.price)*dir);
  }
  let shown=0;
  for(const card of ordered){
   card.hidden=(terms.length&&!terms.every(t=>wordStart(card.dataset.title,t)))||(stock.checked&&card.dataset.available!=='yes');
   if(!card.hidden)shown++;
   grid.append(card);
  }
  $('[data-result-count]',section).textContent=plural(shown,'result','results');
  $('[data-filter-empty]',section).hidden=shown!==0;
 };
 const sorts={'title-ascending':'az','price-ascending':'price-up','price-descending':'price-down'};
 const originalSorts=Object.fromEntries(Object.entries(sorts).map(([key,value])=>[value,key]));
 function readFilters(){
  const params=new URL(location.href).searchParams;
  sort.value=sorts[params.get('sort_by')]||'original';
  if(!sort.value)sort.value='original';
  stock.checked=!stock.closest('label').hidden&&params.get('filter.v.availability')==='1';
  query.value=params.get('filter_name')||'';
  filter();
 }
 function updateFilters(){
  const url=new URL(location.href);
  for(const [key,value] of [['sort_by',originalSorts[sort.value]],['filter.v.availability',stock.checked?'1':''],['filter_name',query.value.trim()]]){
   if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
  }
  history.replaceState(history.state,'',url);
  filter();
 }
 query.addEventListener('input',updateFilters);sort.addEventListener('change',updateFilters);stock.addEventListener('change',updateFilters);
 addEventListener('popstate',readFilters);
 if(new URL(location.href).search)readFilters();
}

const data=$('#product-data');
if(data){
 const item=JSON.parse(data.textContent);
 const form=$('[data-variant-form]'), options=$$('[data-option]',form), add=$('[data-add]',form);
 const price=$('[data-variant-price]'), availability=$('[data-variant-status]');
 const status=$('[data-add-status]'), main=$('.shop-main-image'), modal=$('[data-lightbox]');
 let selected, active=0;
 function photo(index){
  const p=item.images[index];
  if(!p)return;
  active=index;
  const img=$('img',main);img.src=imgUrl(p.url,1200);img.alt=p.alt||item.title;
  for(const thumb of $$('[data-gallery-index]'))thumb.setAttribute('aria-pressed',String(+thumb.dataset.galleryIndex===index));
 }
 for(const thumb of $$('[data-gallery-index]'))thumb.addEventListener('click',()=>photo(+thumb.dataset.galleryIndex));
 main.addEventListener('click',()=>{
  const p=item.images[active];if(!p)return;
  const img=$('img',modal);img.src=imgUrl(p.url,1700);img.alt=p.alt||item.title;
  modal.showModal();
 });
 $('[data-close-photo]',modal).addEventListener('click',()=>modal.close());
 modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
 function update(changePhoto=true){
  const values=options.map(x=>x.value);
  selected=item.variants.find(v=>values.every((s,i)=>s===v.options[i]));
  price.textContent=selected?money(selected.price):'';
  availability.textContent=selected?.available?'In stock on Xazina':'This combination is unavailable';
  add.disabled=!selected?.available;
  if(changePhoto&&selected?.image){
   const index=item.images.findIndex(i=>i.id===selected.image);
   if(index>=0)photo(index);
  }
 }
 const variant=new URL(location.href).searchParams.get('variant');
 const linked=item.variants.find(x=>x.id===variant);
 if(linked)for(const [index,option] of options.entries())option.value=linked.options[index];
 update(Boolean(linked));
 for(const option of options)option.addEventListener('change',()=>{status.textContent='';update();});
 $('[data-quantity]',form).addEventListener('input',()=>{status.textContent='';});
 form.addEventListener('submit',e=>{
  e.preventDefault();status.textContent='';if(!selected?.available)return;
  const items=bag(),found=items.find(x=>x.id===selected.id), qty=asQuantity($('[data-quantity]',form).value);
  if(found)found.qty=asQuantity(found.qty+qty);
  else items.push({id:selected.id,title:item.title,path:item.path,variant:selected.title,qty,price:selected.price,image:item.images[active]?.url||''});
  if(!write(items)){status.textContent='This browser could not save your bag. You can purchase through the original listing.';return}
  counts(items);
  status.replaceChildren(document.createTextNode('Added to your bag. '),anchor(href('/cart'),'View bag'));
 });
}

function renderBag(){
 const target=$('[data-bag]');if(!target)return;
 const items=bag();
 if(!items.length){target.replaceChildren(el('p','Your bag is empty.'),anchor(href('/collections/all'),'Explore jewellery','shop-button dark'));return;}
 const list=el('div','','shop-bag-list');
 const panel=el('aside','','shop-bag-summary');
 const update=next=>{if(write(next)){counts(next);renderBag()}};
 for(const item of items){
  const row=el('article','','shop-bag-row');
  const photo=anchor(href(item.path),'','shop-bag-image'),img=el('img');img.src=imgUrl(item.image,240);img.alt='';photo.append(img);
  const details=el('div');details.append(anchor(href(item.path)+'?variant='+item.id,item.title,'shop-bag-title'));
  if(item.variant&&item.variant!=='Default Title')details.append(el('p',item.variant));
  const qty=el('input');qty.type='number';qty.min='1';qty.max='20';qty.value=asQuantity(item.qty);qty.setAttribute('aria-label','Quantity for '+item.title);
  qty.addEventListener('change',()=>{item.qty=asQuantity(qty.value);update(items)});
  const remove=el('button','Remove','shop-remove');remove.type='button';remove.setAttribute('aria-label','Remove '+item.title);
  remove.addEventListener('click',()=>update(items.filter(i=>i.id!==item.id)));
  details.append(remove);row.append(photo,details,qty,el('b',money(item.price*asQuantity(item.qty))));list.append(row);
 }
 const checkout=STORE+'/cart/'+items.map(i=>i.id+':'+asQuantity(i.qty)).join(',');
 panel.append(el('p','Estimated subtotal','shop-kicker'),el('h2',money(items.reduce((total,i)=>total+i.price*asQuantity(i.qty),0))),
  el('p','Delivery, taxes, prices and stock are confirmed by Xazina.'),anchor(checkout,'Continue to Xazina checkout ↗','shop-button dark'),anchor(href('/collections/all'),'Continue shopping','shop-button glass'));
 target.replaceChildren(list,panel);
}
renderBag();

const search=$('[data-search]');
if(search){
 const input=$('input',search), results=$('[data-search-results]'), status=$('[data-search-status]');
 const kind={product:'Jewellery & fragrance',collection:'Collection',page:'The house',article:'Journal',journal:'Journal',tag:'Journal topic'};
 let pending, version=0;
 function searchData(){
  return pending ||= fetch(B+'/catalog/search.json?v=maison-3').then(r=>{if(!r.ok)throw Error();return r.json()}).catch(e=>{pending=null;throw e;});
 }
 function card(item){
  const root=el('article','','shop-card'), link=anchor(href(item.path),''), media=el('div','','shop-card-image');
  const img=el('img');img.src=imgUrl(item.image,680);img.alt='';img.loading='lazy';media.append(img);
  const label=item.kind==='product'?(item.type||'Xazina jewellery'):(kind[item.kind]||'Xazina');
  const copy=el('div','','shop-card-text');copy.append(el('p',label,'shop-kicker'),el('h2',item.title));
  if(typeof item.price==='number')copy.append(el('p','From '+money(item.price)));
  link.append(media,copy);root.append(link);return root;
 }
 async function show(q){
  const token=++version;
  results.replaceChildren();
  if(!q){$$('.shop-more').forEach(b=>b.remove());status.textContent='Enter a term to explore the catalog.';return;}
  status.textContent='Searching Xazina…';
  try{
   const data=await searchData();if(token!==version)return;
   const norm=q.toLocaleLowerCase(), terms=norm.split(/\s+/).filter(Boolean);
   // Title hits rank above tag-only hits; the whole phrase in a title ranks first.
   const score=x=>(wordStart(x.title,norm)?4:0)+(terms.every(t=>wordStart(x.title,t))?2:0);
   const matches=data.filter(x=>terms.every(t=>wordStart([x.title,x.type,...x.tags].join(' '),t)))
     .map((x,i)=>[x,score(x),i]).sort((a,b)=>b[1]-a[1]||a[2]-b[2]).map(([x])=>x);
   status.textContent=matches.length ? plural(matches.length,'result','results')+' for “'+q+'”':'No results for “'+q+'”. Try a different term.';
   // 72 used to be a silent cap: 97 actual rings were past it with no way to
   // reach them. Results now come in pages with a "Show more" at the end.
   let shown=0;
   const more=el('button','','shop-button glass shop-more');more.type='button';
   const page=()=>{
    const next=matches.slice(shown,shown+48);
    results.append(...next.map(card));
    const first=next.length&&shown?results.children[shown]:null;
    shown+=next.length;
    more.textContent='Show more ('+(matches.length-shown)+' left)';
    if(shown>=matches.length)more.remove();else results.after(more);
    if(first)$('a',first)?.focus();
   };
   more.onclick=page;
   $$('.shop-more').forEach(b=>b.remove());
   page();
  }catch{if(token===version)status.textContent='Search is temporarily unavailable. Please try again.';}
 }
 const read=()=>{input.value=new URL(location.href).searchParams.get('q')||'';show(input.value.trim());};
 search.addEventListener('submit',event=>{event.preventDefault();const url=new URL(location.href);url.searchParams.set('q',input.value.trim());history.pushState(null,'',url);read();});
 addEventListener('popstate',read);read();
 // Arriving from the header's search icon: the field is the next thing to use.
 if(!input.value)input.focus({preventScroll:true});
}

if(window.Motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
 const {animate,inView}=window.Motion;
 const cover=$('.shop-cover-copy');
 if(cover)animate(cover,{opacity:[.52,1],y:[20,0]},{duration:.76,ease:[.17,.7,.23,1]});
 inView('.source-block',node=>{
  if(document.documentElement.dataset.effects==='off')return;
  animate(node,{opacity:[.74,1],y:[12,0]},{duration:.49});
 },{amount:.12});
}

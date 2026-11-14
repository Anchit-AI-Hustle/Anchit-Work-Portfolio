#!/usr/bin/env python3
"""Normalize a public Xazina sitemap capture into the portfolio's static catalog.
Requires Beautiful Soup. Reads only local captures, never fetches during a build.
"""
import hashlib, html, json, re, sys, xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
from bs4 import BeautifulSoup, NavigableString, Tag

BASE = 'https://xazina.com'
MOUNT = '/xazina-revamp'
ROOT = Path(sys.argv[1])
DEST = Path(sys.argv[2])
SHOP = {'xazina.com', 'www.xazina.com'}
MEDIA = SHOP | {'cdn.shopify.com'}
ALLOWED = set('p h1 h2 h3 h4 h5 h6 a ul ol li b strong em i u s small sub sup blockquote table thead tbody tfoot tr th td caption details summary figure figcaption hr br img video source picture dl dt dd'.split())
VOID = {'hr','br','img','source'}
IGNORE = set('script style svg noscript iframe canvas link meta input select textarea option template'.split())
ROUTES = re.compile(r'^/(?:products|collections|pages|blogs|policies)(?:/[^/]+){0,3}$')
SPECIAL = {'/cart','/search','/account','/account/login','/account/register','/account/orders','/checkout','/contact','/collections','/collections/all','/pages','/blogs','/policies'}
FILES = ['privacy-policy','refund-policy','shipping-policy','terms-of-service']

def clean(s):
    return re.sub(r'\s+', ' ', str(s or '')).strip().replace('—',' – ')
def esc(s):
    return html.escape(str(s or ''), quote=True)
def capture(route):
    stem = ROOT/'raw'/hashlib.sha256(route.encode()).hexdigest()[:24]
    try:
        _, code, final = json.loads(stem.with_suffix('.json').read_text())
        if code == 200: return stem.read_text(), final
    except (OSError, ValueError): pass
    return '', ''
def soup(s):
    return BeautifulSoup(s, 'html.parser')
def path_of(url):
    parsed=urlsplit(urljoin(BASE+'/',url))
    return parsed.path.rstrip('/') or '/'
def media(url):
    if not url: return ''
    p=urlsplit(urljoin(BASE+'/',url.strip()))
    if p.scheme=='https' and p.hostname in MEDIA:
        return urlunsplit(('https',p.hostname,p.path,p.query,''))
    return ''
def image_of(node):
    return media(node.get('data-src') or node.get('src') or '')
def title_of(s, fallback):
    h=s.select_one('main h1,.shopify-policy__title h1')
    return clean(h.get_text(' ',strip=True)) if h else (clean(s.title.get_text(' ',strip=True).split('|')[0]) if s.title else fallback)
def slug(path):
    return path.rsplit('/',1)[-1].replace('-',' ').title()
def sitemap(kind):
    f=next(ROOT.glob(f'sitemap_{kind}_*.xml'))
    out={}
    for node in ET.parse(f).getroot().findall('{*}url'):
        path=path_of(node.find('{*}loc').text)
        i=node.find('{*}image')
        out[path]=dict(updated=node.findtext('{*}lastmod',''),title=clean(i.findtext('{*}title')) if i is not None else '',
                       image=media(i.findtext('{*}loc')) if i is not None else '')
    return out
maps={k:sitemap(k) for k in ['products','collections','pages','blogs','articles']}
canonical=set().union(*(set(m) for m in maps.values()),SPECIAL,{'/policies/'+x for x in FILES})
found=set(); alias={}
def href(value, context='/'):
    if not value or value in ('#','javascript:void(0)'): return ''
    if value.startswith('#'): return value if re.fullmatch(r'#[\w.-]+',value) else ''
    p=urlsplit(urljoin(BASE+context,value))
    if p.scheme in ('tel','mailto'): return value
    if p.scheme!='https' or not p.hostname: return ''
    if p.hostname not in SHOP: return urlunsplit(p)
    path=p.path.rstrip('/') or '/'
    if re.match(r'/collections/[^/]+/products/[^/]+$',path):
        alias[path]='/products/'+path.rsplit('/',1)[-1]
    if path.startswith(('/cdn/','/apps/','/challenge','/cart/','/checkouts/')): return urlunsplit(p)
    if path in canonical or path in alias or ROUTES.fullmatch(path):
        found.add(path)
        return MOUNT+('' if path=='/' else path)+('?' + p.query if p.query else '')+('#'+p.fragment if p.fragment else '')
    return urlunsplit(p)
def render(node, context):
    if isinstance(node,NavigableString):
        if type(node).__name__!='NavigableString': return ''
        return esc(str(node).replace('—',' – '))
    if not isinstance(node,Tag):return ''
    name=node.name
    attrs={}
    if name in IGNORE: return ''
    if name in ('form','button'):
        if name=='form' and (node.get('action') or '').startswith('/contact'):
            dest=BASE+context+('#'+node['id'] if node.get('id') else '')
            return '<p><a class="source-action" href="'+esc(dest)+'">Open original form on Xazina</a></p>'
        label=clean(node.get_text(' ',strip=True))
        if label and name=='button' and not node.find_parent('form'):
            if re.fullmatch(r'(previous|next|close|play|pause|add to cart|join|search)',label,re.I):return ''
            return '<p class="source-label">'+esc(label)+'</p>'
        return ''
    if name in ('img','source'):
        url=image_of(node) if name=='img' else media(node.get('src') or (node.get('srcset') or '').split(' ')[0])
        if not url:return ''
        attrs={'src':url}
        if name=='img': attrs.update(alt=clean(node.get('alt')),loading='lazy',decoding='async')
        elif node.get('type'): attrs['type']=node['type']
    elif name=='a':
        link=href(node.get('href'),context)
        if not link:return ''.join(render(c,context) for c in node.children)
        attrs={'href':link}
        if node.get('id') and re.fullmatch(r'[\w.-]+',node['id']):attrs['id']=node['id']
    elif name=='video':
        attrs={'controls':'','preload':'none','playsinline':''}
        if media(node.get('poster')):attrs['poster']=media(node.get('poster'))
        if media(node.get('src')):attrs['src']=media(node.get('src'))
    elif name in ('td','th'):
        attrs={k:node[k] for k in ('rowspan','colspan') if str(node.get(k,'')).isdigit()}
    if name in ('div','section','article','header','aside','main','motion-element','details-disclosure'):
        text=clean(node.get_text(' ',strip=True))
        if not text and not node.find(['img','video','table']):return ''
        name='div'
    elif name not in ALLOWED:
        return ''.join(render(c,context) for c in node.children)
    if node.get('id') and re.fullmatch(r'[\w.-]+',node['id']) and name not in ('img','source'):
        attrs.setdefault('id',node['id'])
    if name=='h1': name='h2'
    if name in ('img','video') and 'mobile' in ' '.join(node.get('class',[])).lower() and node.parent.find(name,class_=lambda c:c and 'desk' in c):return ''
    attributes=''.join(f' {key}="{esc(value)}"' for key,value in attrs.items())
    children=''.join(render(c,context) for c in node.children)
    if not children.strip() and name not in VOID|{'video','a','div'}:return ''
    if name in VOID:return f'<{name}{attributes}>'
    return f'<{name}{attributes}>{children}</{name}>'
def sectionize(main, context):
    blocks=[]
    if not main:return blocks
    for tag in main.find_all(recursive=False):
        if tag.name in IGNORE:continue
        label=tag.select_one('h1,h2,h3')
        head=clean(label.get_text(' ',strip=True)) if label else ''
        text=render(tag,context).strip()
        if not re.sub(r'<[^>]*>|\s|&nbsp;','',text) and not re.search(r'<(img|video|table|a\s)',text):continue
        blocks.append({'title':head,'html':text})
    return blocks

def links(el,context='/'):
    if not el:return []
    items=[]
    for a in el.select('a[href]'):
        label=clean(a.get_text(' ',strip=True) or a.get('aria-label') or (a.img.get('alt') if a.img else ''))
        dest=href(a['href'],context)
        if label and dest and [label,dest] not in items:items.append([label,dest])
    return items

home=soup((ROOT/'home.html').read_text())
menu=[]
for li in home.select('.xh-nav-list > li'):
    a=li.find('a',href=True)
    if a:
        label=clean(a.get_text(' ',strip=True))
        menu.append({'title':label,'href':href(a['href']),'links':links(li)[1:]})
footer=[]
for col in home.select('.lfd-col'):
    head=col.select_one('.lfd-heading')
    footer.append({'title':clean(head.get_text(' ',strip=True)) if head else 'Contact','links':links(col)})
social=links(home.select_one('.lfd-social')) or [a for a in links(home.select_one('#LatestFooterDesign')) if a[1].startswith('https://') and not a[1].startswith(BASE)]
homeblocks=sectionize(home.select_one('main'),'/')
for a in home.select('a[href]'):href(a['href'])
products={}
originProducts=json.loads((ROOT/'products-1.json').read_text())['products']
for page in (2,3):
    txt,_=capture('/products.json?limit=250&page='+str(page))
    if txt:originProducts+=json.loads(txt)['products']
for raw in originProducts:
    path='/products/'+raw['handle']
    price=[float(v['price']) for v in raw['variants'] if v.get('price')]
    images=[{'url':media(i.get('src')),'alt':clean(i.get('alt')),'id':str(i.get('id'))} for i in raw['images'] if media(i.get('src'))]
    products[path]={
      'title':clean(raw['title']),'kind':'product','path':path,'type':clean(raw['product_type']),'image':images[0]['url'] if images else maps['products'].get(path,{}).get('image',''),
      'price':min(price) if price else None,'available':any(v.get('available') for v in raw['variants']),
      'images':images,'description':''.join(render(c,path) for c in soup(raw.get('body_html') or '').contents),
      'options':[{'name':clean(o['name']),'values':o['values']} for o in raw.get('options',[]) if o['name']!='Title'],
      'variants':[{'id':str(v['id']),'title':clean(v['title']),'options':[v.get('option'+str(i)) for i in range(1,4) if v.get('option'+str(i)) is not None],
        'price':float(v['price']),'compare':float(v['compare_at_price']) if v.get('compare_at_price') else None,
        'available':v.get('available',False),'image':str((v.get('featured_image') or {}).get('id') or ''),'sku':clean(v.get('sku'))} for v in raw['variants']],
      'tags':[clean(t) for t in raw.get('tags',[])],
    }

entries={}
coll=json.loads((ROOT/'collections-1.json').read_text())['collections']
memberships={}
for item in coll:
    path='/collections/'+item['handle']
    txt,_=capture(path+'/products.json?limit=250&page=1')
    if not txt:txt,_=capture(path+'/products.json?limit=250')
    count=item['products_count']
    if txt:
        ids=['/products/'+r['handle'] for r in json.loads(txt)['products']]
        memberships[path]=ids
    else: ids=[]
    extra,final=capture(path)
    extraBlocks=[]
    if extra and path_of(final)==path:
        s=soup(extra)
        for sec in (s.select('main > *')):
            # Product cards and filters are rendered from the catalog, not copied.
            if 'product-grid' in (sec.get('id') or '') and sec.select_one('a[href*="/products/"]'):continue
            if sec.select_one('form[action^="/collections"], [id*="ProductGrid"], .collection-product-grid') and sec.select_one('a[href*="/products/"]'):continue
            extraBlocks+=sectionize(soup('<main>'+str(sec)+'</main>').main,path)
    entries[path]={'title':clean(item['title']),'kind':'collection','path':path,'image':media((item.get('image') or {}).get('src')) or maps['collections'].get(path,{}).get('image',''),
                   'description':''.join(render(c,path) for c in soup(item.get('description') or '').contents),
                   'members':ids,'count':count,'captured':bool(txt),'blocks':extraBlocks}
entries['/collections/all']={'title':'All jewellery & fragrance','kind':'collection','path':'/collections/all','image':'','description':'','members':list(products),'count':len(products),'captured':True}
for kind in ['pages','blogs','articles','policy']:
    source=maps[kind] if kind in maps else {'/policies/'+x:{} for x in FILES}
    for path,meta in source.items():
        txt,final=capture(path)
        if not txt:
            probes=ROOT/('probe-'+path.rsplit('/',1)[-1]+'.html')
            if probes.exists(): txt=probes.read_text();final=BASE+path
        if txt and path_of(final)!=path:
            alias[path]=path_of(final); continue
        s=soup(txt); main=s.select_one('main') if txt else None
        if kind=='articles' and main:
            body=main.select_one('.article__content,[itemprop="articleBody"]')
            content=''.join(render(c,path) for c in (body or main).children)
            related=[a for a in links(main,path) if a[1].startswith(MOUNT+'/blogs/') and a[1]!=MOUNT+path][:12]
        else:
            content=''; related=[]
        blocks=sectionize(main,path) if kind not in ('articles','blogs') else []
        if kind=='blogs' and main:
            first=main.find(recursive=False)
            if first:blocks=sectionize(soup('<main>'+str(first)+'</main>').main,path)
        image=meta.get('image','')
        if not image and main:
            for img in main.select('img'):
                image=image_of(img)
                if image:break
        title=title_of(s,meta.get('title') or slug(path))
        if kind=='articles' and meta.get('title'):title=meta['title']
        description=clean((s.select_one('meta[name="description"]') or {}).get('content'))
        published=clean((s.select_one('meta[property="article:published_time"]') or {}).get('content'))
        tags=[path_of(a['href']).rsplit('/',1)[-1] for a in (main.select('a[href*="/tagged/"]') if main else [])]
        entries[path]={'kind':{'pages':'page','blogs':'journal','articles':'article','policy':'policy'}[kind],'path':path,'title':title,'image':image,'description':description,
          'date':published or meta.get('updated',''),'blocks':blocks,'content':content,'related':related,'tags':tags,'captured':bool(main)}
for path in sorted(found-set(entries)-set(products)-set(alias)-SPECIAL-{'/'}):
    txt,final=capture(path)
    if '/tagged/' in path and path.startswith('/blogs/'):
        tag=path.rsplit('/',1)[-1]
        entries[path]={'kind':'tag','tag':tag,'path':path,'title':slug(path),'image':'','description':'','blocks':[],'captured':True}
        continue
    if txt and path_of(final)!=path:alias[path]=path_of(final);continue
    s=soup(txt); main=s.select_one('main')
    entries[path]={'kind':'page','path':path,'title':title_of(s,slug(path)),'image':'','description':'','blocks':sectionize(main,path),'captured':bool(main)}
for f in (ROOT/'raw').glob('*.json'):
    src,code,final=json.loads(f.read_text())
    if '?' not in src and code==200 and final and urlsplit(final).hostname in SHOP and path_of(final)!=src:
        alias[src]=path_of(final)
for path, entry in list(entries.items()):
    if path in alias:del entries[path]
missing_products=sorted(set(maps['products'])-{'/'}-set(products))
missing_captures=sorted(p for p,d in entries.items() if not d['captured'])
missing_collections=[p for p,v in entries.items() if v['kind']=='collection' and v['captured'] and len(v.get('members',[]))!=v['count']]
extras=sorted(p for p in found if ROUTES.fullmatch(p) and p not in canonical and not p.endswith('.json'))
(ROOT/'extra.json').write_text(json.dumps(extras))
observed={r[0]:r[1] for f in (ROOT/'raw').glob('*.json') if (r:=json.loads(f.read_text()))}
dead=sorted(p for p in missing_captures if observed.get(p)==404)
for path in dead:entries[path]['kind']='retired'
inventory={'source':BASE,'retiredSourceLinks':dead,'siteMap':{k:len(v) for k,v in maps.items()},'products':len(products),'routes':len(entries)+len(products),
           'redirects':alias,'missingProducts':missing_products,'missingCaptures':missing_captures,'collectionCountDifferences':missing_collections}
DEST.mkdir(parents=True,exist_ok=True)
(DEST/'snapshot.json').write_text(json.dumps({'products':products,'entries':entries,'menu':menu,'footer':footer,'social':social,'home':homeblocks,'inventory':inventory},ensure_ascii=False,separators=(',',':')))
print(json.dumps({**inventory,'redirects':len(alias),'missingCaptures':len(missing_captures)},ensure_ascii=False))
print('extra links',len(extras),extras[:60])

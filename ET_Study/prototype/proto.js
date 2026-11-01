(function(){
  'use strict';
  function $(s){return document.querySelector(s);}
  function el(tag,attrs,text){var n=document.createElement(tag);if(attrs)Object.keys(attrs).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!=null)n.textContent=text;return n;}
  var toastT;
  function toast(msg){var t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true;},2600);}

  // Old one-page links (/prototype#hub) land on the page that tab became.
  var LEGACY={hub:'hub',rules:'rules',maths:'maths'}, h0=(location.hash||'').slice(1);
  if(LEGACY[h0]&&/\/prototype\/?$/.test(location.pathname)){location.replace('/ET_Study/prototype/'+LEGACY[h0]);return;}

  // ---------- My Stocks (page: stocks)
  if(document.getElementById('stocks')){
  var CO=[
    {id:'kav',name:'Zeltra Power Grid',move:+2.4},
    {id:'nar',name:'Quillon Fintech',move:-3.1},
    {id:'sah',name:'Brastone Cement',move:+0.6},
    {id:'gan',name:'Ovino Foods',move:-0.8},
    {id:'kon',name:'Harbora Ports',move:+1.9},
    {id:'dec',name:'Velmora Pharma',move:+4.2}
  ];
  var STORIES=[
    {co:'kav',t:'Zeltra Power Grid wins a 1,200 MW transmission order',m:'Adds about two years of order book. Execution risk sits in land acquisition; watch the next quarterly update.',k:'Prime',time:'7:05 AM'},
    {co:'nar',t:'Regulator tightens rules on small unsecured loans',m:'Quillon Fintech earns most of its income from this segment; expect slower loan growth for two to three quarters.',k:'Analysis',time:'6:40 AM'},
    {co:'sah',t:'Cement prices hold in the south despite monsoon lull',m:'Steady prices protect Brastone\'s margins; volumes are the variable to watch in December.',k:'News',time:'Yesterday'},
    {co:'gan',t:'Ovino Foods raises prices on two staples by 4%',m:'Price rises offset input costs; the risk is volume loss to regional brands.',k:'News',time:'Yesterday'},
    {co:'kon',t:'Harbora Ports traffic up 11% year on year in October',m:'Container growth is ahead of the sector; the stock already prices in some of it.',k:'Data',time:'6:55 AM'},
    {co:'dec',t:'Velmora Pharma clears a US plant inspection with no observations',m:'Removes the main overhang on the stock; new launches from this plant can now proceed.',k:'Prime',time:'7:20 AM'},
    {co:'kav',t:'Why transmission is the quiet winner of the power capex cycle',m:'The long read behind your Zeltra holding: who wins orders, and why margins differ.',k:'Prime',time:'Sunday'},
    {co:'dec',t:'Analyst note: how three pharma names look into 2027',m:'Velmora is one of the three; the note sets out scenarios, not a recommendation, and lists the risks.',k:'Prime',time:'Yesterday'}
  ];
  var held={kav:true,dec:true,nar:true};
  function renderStocks(){
    var h=$('#holdings');h.innerHTML='';
    CO.forEach(function(c){var b=el('button',{type:'button','class':'chip','aria-pressed':String(!!held[c.id]),'data-co':c.id},c.name);b.addEventListener('click',function(){held[c.id]=!held[c.id];renderStocks();});h.appendChild(b);});
    var feed=$('#feed');feed.innerHTML='';
    var list=STORIES.filter(function(s){return held[s.co];});
    $('#feed-count').textContent=list.length+(list.length===1?' story':' stories');
    if(!list.length){feed.appendChild(el('div',{'class':'empty'},'Pick a holding to build your front page.'));}
    list.forEach(function(s){
      var c=CO.filter(function(x){return x.id===s.co;})[0];
      var a=el('article',{'class':'story','data-story':s.co});
      var meta=el('div',{'class':'meta'});
      meta.appendChild(el('span',{'class':'tag'+(s.k==='Prime'?' r':'')},s.k));
      meta.appendChild(el('span',null,c.name+' (fictional)'));
      meta.appendChild(el('span',{'class':c.move>=0?'up':'down'},(c.move>=0?'+':'')+c.move.toFixed(1)+'% today'));
      meta.appendChild(el('span',null,s.time));
      a.appendChild(meta);a.appendChild(el('h3',null,s.t));
      var m=el('p',{'class':'mean'});m.appendChild(el('b',null,'What it means for you: '));m.appendChild(document.createTextNode(s.m));a.appendChild(m);
      feed.appendChild(a);
    });
    var br=$('#brief');br.innerHTML='';
    var mine=CO.filter(function(c){return held[c.id];});
    if(!mine.length){br.appendChild(el('li',null,'No holdings picked yet.'));return;}
    var up=mine.filter(function(c){return c.move>=0;}).length;
    br.appendChild(el('li',null,mine.length+' of your holdings moved: '+up+' up, '+(mine.length-up)+' down.'));
    var big=mine.slice().sort(function(a,b){return Math.abs(b.move)-Math.abs(a.move);})[0];
    br.appendChild(el('li',null,'Biggest move: '+big.name+', '+(big.move>=0?'+':'')+big.move.toFixed(1)+'%.'));
    br.appendChild(el('li',null,list.length+' new '+(list.length===1?'story':'stories')+' about what you own, '+list.filter(function(s){return s.k==='Prime';}).length+' of them Prime.'));
  }
  renderStocks();

  }
  // ---------- Member hub (page: hub)
  if(document.getElementById('hub')){
  var renew=true;
  function renderTimeline(){
    var t=$('#timeline');t.innerHTML='';
    var rows=renew?[
      ['7 Jan 2027','Reminder: renews in 7 days at ₹3,899. One tap to cancel.'],
      ['13 Jan 2027','Pre-debit notice, at least 24 hours before, as RBI requires.'],
      ['14 Jan 2027','Renewal charged; invoice in this hub the same minute.']
    ]:[
      ['14 Jan 2027','Access ends. No charge. Your reading history is kept for 12 months if you come back.']
    ];
    rows.forEach(function(r){var li=el('li');li.appendChild(el('b',null,r[0]));li.appendChild(el('span',null,r[1]));t.appendChild(li);});
    $('#m-renew').textContent=renew?'On':'Off';
    $('#m-status').textContent=renew?'Active until 14 Jan 2027':'Active until 14 Jan 2027, will not renew';
    $('#cancel').textContent=renew?'Turn off auto-renew':'Turn auto-renew back on';
  }
  renderTimeline();
  $('#cancel').addEventListener('click',function(){
    if(renew){$('#confirm').hidden=false;$('#confirm-yes').focus();}
    else{renew=true;renderTimeline();toast('Auto-renew is back on.');}
  });
  $('#confirm-no').addEventListener('click',function(){$('#confirm').hidden=true;});
  $('#confirm-yes').addEventListener('click',function(){renew=false;$('#confirm').hidden=true;renderTimeline();toast('Auto-renew is off. You keep access until 14 Jan 2027.');});
  $('#restore').addEventListener('click',function(){
    var b=this;b.disabled=true;var log=$('#restore-log');log.innerHTML='';
    var steps=['Looking up payments on this account','Found ET Prime 1+1 year, bought on the website','Access restored on this device and the website'];
    steps.forEach(function(s,i){setTimeout(function(){log.appendChild(el('li',{'class':'ok'},s));if(i===steps.length-1){b.disabled=false;b.textContent='Access restored';}},300*(i+1));});
  });
  $('#invoice').addEventListener('click',function(){
    var txt=['TAX INVOICE (DEMO, NOT A REAL INVOICE)','','Member: Demo Reader','Plan: ET Prime, 1+1 year','Date: 14 Jan 2025','Amount: Rs 3,304.24','GST 18%: Rs 594.76','Total: Rs 3,899.00','','Generated in the member hub prototype by Anchit Tandon.'].join('\n');
    var url=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
    var a=el('a',{href:url,download:'et-prime-invoice-demo.txt'});document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
    toast('Invoice downloaded. No email needed.');
  });

  }
  // ---------- Who sees what (page: rules)
  if(document.getElementById('rules')){
  var WHO={
    newv:{label:'New visitor',ads:'Standard ad layout, nothing above the headline on phones',offer:'One offer on the paywall: one main button, one secondary',wall:'Preview, then the offer',call:'Never. No phone number yet.',notif:'Asked once, after the second story read',pill:'Subscribe',pop:false,ad:'big',why:'A first visit should earn the second, not push the sale.'},
    reader:{label:'Registered reader',ads:'Standard ad layout',offer:'One offer, plus the free morning brief',wall:'Preview, then the offer',call:'Only if they ask for a callback',notif:'Topics they picked; at most 3 a day; each opens its story',pill:'Subscribe',pop:false,ad:'big',why:'Registered readers are the best leads, which is why they are called only when they ask.'},
    member:{label:'Active member',ads:'Member layout: one native slot per story, no pop-ups or video',offer:'None. No sale banners, no "Subscribe" buttons, no pop-ups',wall:'Full story',call:'Never. Suppressed from every dialer list',notif:'Their stocks and topics; each opens its story',pill:'Member',pop:false,ad:'native',why:'The promise of "90% less ads" is kept by a rule, and paywalls shown to members are counted as defects.'},
    lapsed:{label:'Lapsed member',ads:'Standard ad layout',offer:'One win-back offer with what they used most',wall:'Preview, then the win-back offer',call:'One call within 30 days, only if they opted in',notif:'Their stocks, weekly',pill:'Rejoin',pop:false,ad:'big',why:'A lapsed member knows the product; remind them of what they used, once.'},
    asked:{label:'Asked for a call',ads:'Standard ad layout',offer:'One offer, matching what they asked about',wall:'Preview, then the offer',call:'Within 24 hours, from one number, 10 AM to 7 PM, never after a "no"',notif:'As a registered reader',pill:'Subscribe',pop:false,ad:'big',why:'Assisted sales works best on people who raised their hand. Scoring every call keeps it that way.'},
    today:{label:'Member today (for contrast)',ads:'Full ad layout, including pop-ups and video',offer:'"Diwali Sale" banner, launch pop-up, Subscribe buttons',wall:'Sometimes asked to subscribe again',call:'Can still be called',notif:'Opens the home page',pill:'Diwali Sale!',pop:true,ad:'big',why:'What reviewers describe today: a member treated like a prospect (problem P1).'}
  };
  var cur='member';
  function renderWho(){
    var g=$('#who');g.innerHTML='';
    Object.keys(WHO).forEach(function(k){var b=el('button',{type:'button','class':'chip','data-who':k,'aria-pressed':String(k===cur)},WHO[k].label);b.addEventListener('click',function(){cur=k;renderWho();});g.appendChild(b);});
    var w=WHO[cur];
    var tb=$('#rules-tbl tbody');tb.innerHTML='';
    [['Ads','ads'],['Offers and upsells','offer'],['Prime story','wall'],['Sales call','call'],['Notifications','notif']].forEach(function(r){var tr=el('tr',{'data-rule':r[1]});tr.appendChild(el('th',{scope:'row'},r[0]));tr.appendChild(el('td',null,w[r[1]]));tb.appendChild(tr);});
    $('#rules-why').textContent=w.why;
    $('#ph-pill').textContent=w.pill;
    var body=$('#ph-body');body.innerHTML='';
    if(w.ad==='big')body.appendChild(el('div',{'class':'ad big','data-ph':'ad-top'},'Ad'));
    body.appendChild(el('div',{'class':'hl'},'Why transmission is the quiet winner of the power capex cycle'));
    for(var i=0;i<3;i++)body.appendChild(el('div',{'class':'txt'}));
    if(w.wall==='Full story'){for(var j=0;j<4;j++)body.appendChild(el('div',{'class':'txt'}));body.appendChild(el('div',{'class':'ad native','data-ph':'ad-native'},'One native slot'));for(var k=0;k<3;k++)body.appendChild(el('div',{'class':'txt'}));}
    else{var wl=el('div',{'class':'wall','data-ph':'wall'});wl.appendChild(el('span',null,cur==='lapsed'?'Welcome back. Your watchlist is still here.':'The full story is for ET Prime members.'));wl.appendChild(el('span',{'class':'b'},cur==='lapsed'?'Rejoin':'Become a member'));wl.appendChild(el('span',{'class':'b2'},'See plans'));body.appendChild(wl);}
    var pop=$('#ph-pop');pop.hidden=!w.pop;pop.textContent=w.pop?'DIWALI SALE: Buy 1 Year, Get 1 Year Free!':'';
  }
  renderWho();

  }
  // ---------- Renewal maths (page: maths)
  if(document.getElementById('maths')){
  var inr=new Intl.NumberFormat('en-IN');
  function lakh(n){return n>=1e7?'₹'+(n/1e7).toFixed(2)+' crore':'₹'+(n/1e5).toFixed(1)+' lakh';}
  function maths(){
    var m=+$('#s-members').value,p=+$('#s-price').value,l=+$('#s-lift').value;
    $('#o-members').textContent=inr.format(m);
    $('#o-price').textContent='₹'+inr.format(p);
    $('#o-lift').textContent='+'+l+(l===1?' point':' points');
    var extra=Math.round(m*l/100);
    $('#total').textContent=lakh(extra*p);
    $('#total-why').textContent=inr.format(extra)+' more members renewing × ₹'+inr.format(p)+' a year.';
  }
  ['#s-members','#s-price','#s-lift'].forEach(function(s){$(s).addEventListener('input',maths);});
  maths();
  }
})();

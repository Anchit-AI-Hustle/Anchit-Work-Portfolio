(function(){
  'use strict';
  // Fixes page: filter by who a fix serves (chips), or by the problem it
  // solves (the legend, or a #P3 link from the problems page).
  var fixes=[].slice.call(document.querySelectorAll('[data-solves]'));
  var chips=[].slice.call(document.querySelectorAll('[data-filter]'));
  var status=document.querySelector('.fix-status');
  if(fixes.length&&status){
    var label=function(n){return n+(n===1?' fix':' fixes');};
    var show=function(test,msg,chip){
      var n=0;
      fixes.forEach(function(f){var on=test(f);f.hidden=!on;if(on)n++;});
      chips.forEach(function(c){c.setAttribute('aria-pressed',String(c===chip));});
      status.innerHTML='';
      var s=document.createElement('span');s.setAttribute('data-fix-count','');s.textContent=msg(n);status.appendChild(s);
      if(!chip){var b=document.createElement('button');b.type='button';b.textContent='Show all';b.addEventListener('click',function(){byWho('all');});status.appendChild(b);}
    };
    var byWho=function(w){
      var chip=document.querySelector('[data-filter="'+w+'"]');
      show(function(f){return w==='all'||f.dataset.who.split(/\s+/).indexOf(w)>-1;},function(n){return label(n)+' shown'+(w==='all'?'':' for '+chip.textContent.toLowerCase());},chip);
    };
    var byProblem=function(p){
      show(function(f){return f.dataset.solves.split(/\s+/).indexOf(p)>-1;},function(n){return label(n)+' shown that solve '+p;},null);
    };
    chips.forEach(function(c){c.addEventListener('click',function(){byWho(c.dataset.filter);});});
    [].forEach.call(document.querySelectorAll('[data-jump]'),function(a){
      a.addEventListener('click',function(e){
        e.preventDefault();byProblem(a.dataset.jump);
        if(history.replaceState)history.replaceState(null,'','#'+a.dataset.jump);
        var t=document.getElementById('fix-list');
        if(t)t.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
      });
    });
    var fromHash=function(){var m=/^#(P\d+)$/.exec(location.hash);if(m)byProblem(m[1]);};
    window.addEventListener('hashchange',fromHash);
    fromHash();
  }
  // Wide tables scroll sideways: reachable by keyboard, flagged for the phone cue.
  function mark(){document.querySelectorAll('.tbl').forEach(function(t){var w=t.scrollWidth>t.clientWidth+2;t.classList.toggle('is-wide',w);if(w){t.tabIndex=0;t.setAttribute('role','region');if(!t.hasAttribute('aria-label'))t.setAttribute('aria-label','Table, scrolls sideways');}});}
  if(document.readyState!=='loading')mark();else document.addEventListener('DOMContentLoaded',mark);
  window.addEventListener('resize',mark,{passive:true});
})();
// Roadmap: show one stage across all three bets, or every stage.
(function(){
  var chips=[].slice.call(document.querySelectorAll('[data-stagefilter]'));
  if(!chips.length)return;
  function show(k){
    chips.forEach(function(c){var on=c.dataset.stagefilter===k;c.classList.toggle('on',on);c.setAttribute('aria-pressed',on?'true':'false');});
    [].forEach.call(document.querySelectorAll('.stage[data-stage]'),function(s){s.hidden=!(k==='all'||s.dataset.stage===k);});
  }
  chips.forEach(function(c){c.addEventListener('click',function(){show(c.dataset.stagefilter);});});
})();

// Videos: nothing loads from YouTube until the reader presses play.
(function(){
  [].forEach.call(document.querySelectorAll('.vid-play'),function(b){
    b.addEventListener('click',function(){
      var f=document.createElement('iframe');
      f.src='https://www.youtube-nocookie.com/embed/'+b.dataset.yt+'?autoplay=1&rel=0';
      f.title=b.getAttribute('aria-label').replace(/^Play video: /,'');
      f.allow='autoplay; encrypted-media; picture-in-picture';f.allowFullscreen=true;f.loading='lazy';
      f.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      b.parentNode.replaceChild(f,b);
    });
  });
})();

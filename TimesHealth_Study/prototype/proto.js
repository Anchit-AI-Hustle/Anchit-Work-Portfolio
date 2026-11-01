(function(){
  'use strict';
  function $(s){return document.querySelector(s);}
  function el(tag,attrs,text){var n=document.createElement(tag);if(attrs)Object.keys(attrs).forEach(function(k){n.setAttribute(k,attrs[k]);});if(text!=null)n.textContent=text;return n;}
  var toastT;function toast(m){var t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true;},2600);}
  var inr=new Intl.NumberFormat('en-IN');

  // Old one-page links (/prototype#hub) land on the page that tab became.
  var LEGACY={week:'week',race:'race',biz:'business'}, h0=(location.hash||'').slice(1);
  if(LEGACY[h0]&&/\/prototype\/?$/.test(location.pathname)){location.replace('/TimesHealth_Study/prototype/'+LEGACY[h0]);return;}

  // Single- or multi-select chip groups.
  function chips(host,items,state,multi,onChange){
    var h=$(host);
    function draw(){
      h.innerHTML='';
      items.forEach(function(it){
        var on=multi?state.val.indexOf(it[0])>-1:state.val===it[0];
        var b=el('button',{type:'button','class':'chip','aria-pressed':String(on),'data-v':it[0]},it[1]);
        b.addEventListener('click',function(){
          if(multi){var i=state.val.indexOf(it[0]);if(i>-1)state.val.splice(i,1);else state.val.push(it[0]);}
          else state.val=it[0];
          draw();onChange();
        });
        h.appendChild(b);
      });
    }
    draw();
  }

  // ---------- 1. Start ----------
  // The published IST batches.
  var SLOTS=[['5:15 AM','early'],['6:30 AM','early'],['8:00 AM','morning'],['9:00 AM','morning'],['4:45 PM','evening'],['6:00 PM','evening'],['7:30 PM','night'],['8:30 PM','night']];
  var GOALS=[
    ['fit','Feel fitter','Daily yoga','Daily live yoga, a weekly pranayama class led by The Yoga Institute, and a catch-up for every class.',null,'Stiffness'],
    ['weight','Lose weight','Daily yoga + mindful eating','Daily yoga plus the nutrition and mindful-eating sessions, with a weekly weigh-in in your check-in.',null,'Cravings'],
    ['sugar','Prediabetes or sugar','12-week blood sugar programme','Classes chosen for blood sugar, the diet team every week, and fasting sugar tracked weekly.','Check with your doctor before starting, and keep taking any medicine you have been prescribed.','Fasting sugar (feel)'],
    ['bp','Blood pressure','12-week blood pressure programme','Gentle asana, breathing and relaxation, the diet team for salt and sleep, and home BP readings tracked weekly.','Check with your doctor first. Some inversions and breath-holds are left out for you.','Stress'],
    ['pcos','PCOS','12-week PCOS programme','Strength-building yoga, the diet team, and cycle regularity and energy tracked weekly.','Check with your doctor or gynaecologist before starting.','Energy'],
    ['back','Back pain','12-week back care programme','Mobility and core classes, a short daily routine, and pain levels tracked weekly.','If you have numbness, weakness or pain after an injury, see a doctor first.','Back pain'],
    ['run','Train for a race','Yoga for runners + race plan','Mobility and recovery classes alongside a running plan to race day. See the Race plan page.',null,'Soreness']
  ];
  var WIN=[['early','Early morning, 5 to 7:30'],['morning','Morning, 8 to 10'],['evening','Evening, 4:30 to 7'],['night','Night, 7:30 to 9:30']];
  var LEV=[['new','New to yoga'],['some','Done some'],['regular','Practise regularly']];
  var METRIC={
    fit:{label:'Stiffness',min:1,max:5,step:1,val:3,unit:' / 5'},
    weight:{label:'Weight',min:40,max:150,step:0.5,val:72,unit:' kg'},
    sugar:{label:'Fasting sugar',min:70,max:250,step:1,val:112,unit:' mg/dL'},
    bp:{label:'Home BP, systolic',min:90,max:190,step:1,val:134,unit:' mmHg'},
    pcos:{label:'Cycle length',min:20,max:60,step:1,val:34,unit:' days'},
    back:{label:'Back pain',min:0,max:10,step:1,val:5,unit:' / 10'},
    run:{label:'Soreness',min:1,max:5,step:1,val:2,unit:' / 5'}
  };
  var saved='fit';try{saved=localStorage.getItem('th-goal')||'fit';}catch(e){}
  if(!GOALS.some(function(x){return x[0]===saved;}))saved='fit';
  var S={goal:{val:saved},win:{val:['evening']},lev:{val:'new'}};
  function g(){return GOALS.filter(function(x){return x[0]===S.goal.val;})[0];}
  function renderStart(){
    var goal=g(), track=/^12-week/.test(goal[2]);
    $('#prog-name').textContent=goal[2];
    $('#prog-what').textContent=goal[3]+(S.lev.val==='new'?' Your first two weeks use the beginner sequence.':'');
    $('#prog-tag').textContent=track?'Condition programme':'Your programme';
    var match=SLOTS.filter(function(s){return S.win.val.indexOf(s[1])>-1;});
    var sl=$('#slots');sl.innerHTML='';
    if(match.length){
      match.forEach(function(s,i){sl.appendChild(el('span',{'class':'slot '+(i===0?'main':i===1?'back':''),'data-slot':s[0]},s[0]+(i===0?' · default':i===1?' · backup':'')));});
      $('#slot-note').textContent='Reminders for your default slot; one tap moves you to the backup. Every class is also on catch-up.';
    }else{
      sl.appendChild(el('span',{'class':'slot','data-slot':'none'},'No live slot fits'));
      $('#slot-note').textContent='None of the eight live batches fits these times, so your plan uses the 20-minute catch-up versions instead.';
    }
    var p=$('#plans');p.innerHTML='';
    var plans=track?[['12 weeks, everything included','₹5,999','₹500 a week; diet team and classes',true]]:[['Yearly','₹4,999','about ₹417 a month',true],['Monthly','₹699','cancel any time',false]];
    plans.forEach(function(x){var d=el('div',{'class':'plan'+(x[3]?' best':''),'data-plan':x[0]});var l=el('div');l.appendChild(el('div',{'class':'small',style:'font-weight:700;color:var(--ink)'},x[0]));l.appendChild(el('div',{'class':'small muted'},x[2]));d.appendChild(l);d.appendChild(el('b',null,x[1]));p.appendChild(d);});
    p.appendChild(el('p',{'class':'small muted',style:'margin-top:6px'},'Illustrative prices for this prototype, shown before sign-up as fix F1 asks.'));
    var sf=$('#safety');sf.hidden=!goal[4];sf.textContent=goal[4]||'';
    try{localStorage.setItem('th-goal',goal[0]);}catch(e){}
  }
  if(document.getElementById('start')){
    chips('#goals',GOALS.map(function(x){return [x[0],x[1]];}),S.goal,false,renderStart);
    chips('#windows',WIN,S.win,true,renderStart);
    chips('#levels',LEV,S.lev,false,renderStart);
    $('#trial').addEventListener('click',function(){toast('Next step: your phone number and an OTP. Nothing is sent in this prototype.');});
    renderStart();
  }

  // ---------- 2. My week ----------
  if(document.getElementById('week')){
  var NAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var ORDER=['planned','live','catchup','missed'];
  var LABEL={planned:'Planned',live:'Live',catchup:'Catch-up',missed:'Missed'};
  var ICON={planned:'·',live:'✓',catchup:'↺',missed:'×'};
  var week=['live','catchup','missed','planned','planned','planned','planned'];
  var GRACE=2, TARGET=3;
  function renderWeek(){
    var d=$('#days');d.innerHTML='';
    week.forEach(function(st,i){
      var b=el('button',{type:'button','class':'day','data-day':String(i),'data-state':st,'aria-label':NAMES[i]+': '+LABEL[st]+'. Tap to change.'});
      b.appendChild(el('span',{'class':'d'},NAMES[i]));b.appendChild(el('span',{'class':'i','aria-hidden':'true'},ICON[st]));b.appendChild(el('span',{'class':'s'},LABEL[st]));
      b.addEventListener('click',function(){week[i]=ORDER[(ORDER.indexOf(st)+1)%ORDER.length];renderWeek();});
      d.appendChild(b);
    });
    var done=week.filter(function(s){return s==='live'||s==='catchup';}).length;
    var catchup=week.filter(function(s){return s==='catchup';}).length;
    var missed=week.filter(function(s){return s==='missed';}).length;
    var graceLeft=Math.max(0,GRACE-missed);
    $('#st-days').textContent=done;$('#st-catch').textContent=catchup;$('#st-grace').textContent=graceLeft;
    $('#meter').style.width=Math.min(100,Math.round(done/TARGET*100))+'%';
    $('#goal-txt').textContent=done+' of '+TARGET+(done>=TARGET?', goal met':'');
    var two=false;for(var i=1;i<week.length;i++){if(week[i]==='missed'&&week[i-1]==='missed')two=true;}
    $('#nudge').hidden=!two;
    $('#streak-txt').textContent=missed>GRACE?'More than two misses this week: the streak pauses, and next week starts fresh. No penalty.':'Streak alive: 6 weeks. '+(graceLeft===GRACE?'Both grace days unused.':graceLeft+' grace day'+(graceLeft===1?'':'s')+' left this week.');
  }
  $('#nudge-do').addEventListener('click',function(){
    for(var i=week.length-1;i>0;i--){if(week[i]==='missed'&&week[i-1]==='missed'){week[i]='catchup';break;}}
    renderWeek();toast('20-minute catch-up logged. Streak kept.');
  });
  renderWeek();
  var WORDS=['','Poor','Low','OK','Good','Great'];
  function renderCheckin(){
    var s=+$('#r-sleep').value,e=+$('#r-energy').value,gl=+$('#r-goal').value;
    var mt=METRIC[S.goal.val];
    $('#o-sleep').textContent=WORDS[s];$('#o-energy').textContent=WORDS[e];$('#o-goal').textContent=gl+mt.unit;
    var low=s<=2||e<=2;
    var track=/^(weight|sugar|bp|pcos|back)$/.test(S.goal.val);
    $('#checkin-out').textContent='Logged: '+mt.label+', '+gl+mt.unit+'. '+(low?'Low sleep or energy this week: next week\'s plan swaps one class for a restorative session and a short evening breathing practice.':'Next week keeps the same plan.')+(track?' Your diet coach sees this trend at your weekly consult.':' Your trend chart updates every Sunday.');
  }
  ['#r-sleep','#r-energy','#r-goal'].forEach(function(s){$(s).addEventListener('input',renderCheckin);});
  var mt0=METRIC[S.goal.val], r0=$('#r-goal');
  $('#goal-label').firstChild.nodeValue=mt0.label+' ';
  r0.min=mt0.min;r0.max=mt0.max;r0.step=mt0.step;r0.value=mt0.val;
  $('#goal-name').textContent=g()[1];
  renderCheckin();
  }

  // ---------- 3. Race plan ----------
  if(document.getElementById('race')){
  var TODAY=Date.UTC(2026,10,1);
  var RACES=[['blr','Bengaluru · Sun 20 Dec 2026',Date.UTC(2026,11,20),'the next city in the series'],['mum','Mumbai · Sun 14 Feb 2027',Date.UTC(2027,1,14),'the next city in the series'],['del','Delhi · Sun 28 Mar 2027',Date.UTC(2027,2,28),'the next city in the series']];
  var DIST=[['3','3K'],['5','5K'],['10','10K'],['21.1','21.1K']];
  var MIN={first:{'3':4,'5':6,'10':10,'21.1':14},exp:{'3':2,'5':4,'10':6,'21.1':10}};
  var R={city:{val:'mum'},dist:{val:'10'},first:{val:'yes'}};
  var city=$('#city');RACES.forEach(function(r){var o=el('option',{value:r[0]},r[1]);city.appendChild(o);});city.value=R.city.val;
  city.addEventListener('change',function(){R.city.val=city.value;renderRace();});
  function renderRace(){
    var race=RACES.filter(function(r){return r[0]===R.city.val;})[0];
    var weeks=Math.floor((race[2]-TODAY)/(7*864e5));
    var km=parseFloat(R.dist.val), first=R.first.val==='yes';
    var need=MIN[first?'first':'exp'][R.dist.val];
    $('#weeks-to').textContent=weeks;
    var w=$('#race-warn');
    if(weeks<need){w.hidden=false;w.textContent='Safely building to '+R.dist.val+'K'+(first?' as a first-timer':'')+' takes about '+need+' weeks; you have '+weeks+'. Pick a shorter distance or a later race in the series. Under fix F12 you could move down a category or transfer your entry. The plan is held back until the runway is safe.';}
    else w.hidden=true;
    if(weeks<need){
      $('#race-sum').textContent='Plan held back: '+weeks+' weeks is not enough to build safely to this distance.';
      var o=$('#plan');o.innerHTML='';
      var h=el('li',{'data-week':'held'});h.appendChild(el('b',null,'Choose a shorter distance or a later race'));
      h.appendChild(el('span',{'class':'sub'},'A safe plan builds gradually, about 10% more each week. Squeezing it raises the risk of injury, so the plan appears once the runway is long enough.'));
      o.appendChild(h);return;
    }
    var peak=km<=5?km:km===10?10:18;
    var base=first?Math.min(2,km):Math.min(4,km);
    var runs=first?3:4;
    $('#race-sum').textContent=runs+' runs and 2 yoga-for-runners sessions a week; longest run '+peak+' km, '+(weeks>1?'two weeks':'one week')+' before race day.';
    var ol=$('#plan');ol.innerHTML='';
    var build=Math.max(1,weeks-1);
    for(var i=1;i<=weeks;i++){
      var li=el('li',{'data-week':String(i)});
      if(i===weeks){li.className='race';li.appendChild(el('b',null,'Week '+i+' · Race week'));li.appendChild(el('span',{'class':'sub'},'Two easy 20-minute runs, mobility on Friday, race on Sunday. Heat and air-quality update and hydration plan two days before (F14).'));}
      else if(i===weeks-1&&weeks>3){li.className='taper';li.appendChild(el('b',null,'Week '+i+' · Taper'));li.appendChild(el('span',{'class':'sub'},'Volume down by a third. Long run '+Math.round(peak*0.6)+' km. Two yoga-for-runners sessions.'));}
      else{var long=Math.round((base+(peak-base)*Math.min(1,i/Math.max(1,build-1)))*10)/10;li.appendChild(el('b',null,'Week '+i+(i%4===0?' · Easier week':'')));li.appendChild(el('span',{'class':'sub'},runs+' runs, long run '+(i%4===0?Math.round(long*0.75*10)/10:long)+' km; yoga for runners on Tuesday and Saturday'+(first&&i<=2?'; walk breaks are fine':'')+'.'));}
      ol.appendChild(li);
    }
    var after=el('li',{'data-week':'after'});after.appendChild(el('b',null,'The day after · Recovery and a next goal'));after.appendChild(el('span',{'class':'sub'},'Results, photos and your certificate on race day. A 30-day recovery and mobility programme, then '+race[3]+' as your next goal (F11).'));ol.appendChild(after);
  }
  chips('#dist',DIST,R.dist,false,renderRace);
  chips('#first',[['yes','Yes, my first'],['no','No']],R.first,false,renderRace);
  renderRace();
  }

  // ---------- 4. Business view ----------
  if(document.getElementById('biz')){
  function lakh(n){return n>=1e7?'₹'+(n/1e7).toFixed(2)+' crore':'₹'+(n/1e5).toFixed(1)+' lakh';}
  function biz(){
    var run=+$('#b-run').value,races=+$('#b-races').value,plan=+$('#b-plan').value,trial=+$('#b-trial').value,paid=+$('#b-paid').value,price=+$('#b-price').value;
    $('#ob-run').textContent=inr.format(run);$('#ob-races').textContent=races;$('#ob-plan').textContent=plan+'%';$('#ob-trial').textContent=trial+'%';$('#ob-paid').textContent=paid+'%';$('#ob-price').textContent='₹'+inr.format(price);
    var all=run*races, p=Math.round(all*plan/100), t=Math.round(p*trial/100), m=Math.round(t*paid/100);
    $('#b-members').textContent=inr.format(m);
    $('#b-funnel').textContent=inr.format(all)+' runners → '+inr.format(p)+' start the plan → '+inr.format(t)+' start a trial → '+inr.format(m)+' pay.';
    $('#b-rev').textContent=lakh(m*price);
  }
  ['#b-run','#b-races','#b-plan','#b-trial','#b-paid','#b-price'].forEach(function(s){$(s).addEventListener('input',biz);});
  biz();
  }
})();

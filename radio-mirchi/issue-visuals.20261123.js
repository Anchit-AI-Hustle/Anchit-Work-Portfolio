// All 28 issues remain in the HTML for accessibility and no-JS/print support.
document.addEventListener('DOMContentLoaded',()=>{
 const grid=document.getElementById('issue-visual-grid');
 const platform=document.getElementById('issue-platform-filter');
 const priority=document.getElementById('issue-priority-filter');
 const evidence=document.getElementById('issue-evidence-filter');
 const count=document.getElementById('issue-count');
 if(!grid||!platform||!priority||!evidence||!count)return;
 const cards=[...grid.querySelectorAll('.issue-visual-card')];
 const update=()=>{
  let shown=0;
  for(const card of cards){
   const p=platform.value==='all'||card.dataset.issueApp===platform.value;
   const q=priority.value==='all'||card.dataset.issuePriority===priority.value;
   const e=evidence.value==='all'||card.dataset.issueProof===evidence.value;
   card.hidden=!(p&&q&&e);if(!card.hidden)shown++;
  }
  count.textContent='Showing '+shown+' of '+cards.length+' issues';
 };
 for(const el of [platform,priority,evidence])el.addEventListener('change',update);
 update();
});

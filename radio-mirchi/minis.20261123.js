// Mini-OTT concept browser: filters illustrative titles only. Does not stream media.
document.addEventListener('DOMContentLoaded',()=>{
 const group=document.querySelector('.mini-filter');
 const cards=[...document.querySelectorAll('.mini-series-card')];
 const output=document.getElementById('mini-filter-count');
 if(!group||!cards.length||!output)return;
 const buttons=[...group.querySelectorAll('[data-mini-filter]')];
 group.addEventListener('click',event=>{
  const button=event.target.closest('[data-mini-filter]');
  if(!button||!group.contains(button))return;
  const choice=button.dataset.miniFilter;
  let showing=0;
  for(const card of cards){const visible=choice==='all'||card.dataset.miniGenre===choice;card.hidden=!visible;if(visible)showing++}
  for(const item of buttons)item.setAttribute('aria-pressed',String(item===button));
  output.textContent='Showing '+showing+' proposed '+(showing===1?'series':'series');
 });
});

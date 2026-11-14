const link=document.querySelector('#destination');
if(link) location.replace(link.pathname+location.search+location.hash);

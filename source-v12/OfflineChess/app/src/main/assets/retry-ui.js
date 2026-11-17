(function(){'use strict';
const A=window.OfflineChessApp,I=window.OfflineChessInsights,R=window.OfflineChessReview,C=window.OfflineChessCore,$=id=>document.getElementById(id);
let items=[],cursor=0,g=null,orientation='w',selected=-1,done=false,answer=false;
function draw(){if(!g)return;const e=items[cursor],moves=!done?g.legalMoves().filter(m=>m.from===selected):[],cells=[];
 for(let vis=0;vis<64;vis++){const i=orientation==='w'?vis:63-vis,p=g.board[i],r=vis>>3,c=vis&7,legal=moves.some(m=>m.to===i);
  cells.push(`<div class="cell ${((r+c)%2)?'dark':'light'}${selected===i?' selected':''}${legal?' legal':''}" data-retry-square="${i}">${p?A.pieceHtml(p):''}${c===0?`<span class="coord rank">${orientation==='w'?8-r:r+1}</span>`:''}${r===7?`<span class="coord file">${orientation==='w'?'abcdefgh'[c]:'hgfedcba'[c]}</span>`:''}</div>`);}
 let arrow='';if(answer&&e.best){const f=C.index(e.best.slice(0,2)),t=C.index(e.best.slice(2,4));const a=orientation==='w'?f:63-f,b=orientation==='w'?t:63-t;
 const x1=((a&7)+.5)*12.5,y1=((a>>3)+.5)*12.5,x2=((b&7)+.5)*12.5,y2=((b>>3)+.5)*12.5;
 arrow=`<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="review-arrow"><defs><marker id="retry-tip" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4Z" fill="#f0b44e" /></marker></defs><path d="M${x1} ${y1} L${x2} ${y2}" stroke="#f0b44e" stroke-width="2.4" marker-end="url(#retry-tip)" /></svg>`;}
 $('retry-board').innerHTML=cells.join('')+arrow;$('retry-counter').textContent=`Ошибка ${cursor+1} из ${items.length}`;
 $('retry-move').textContent=`${Math.ceil(e.ply/2)}${e.side==='w'?'.':'...'} ${e.san} · ${R.LABELS[e.kind]}`;
 $('retry-next').textContent=cursor+1===items.length?'Завершить':'Следующая ошибка →';$('retry-solution').disabled=done;}
function load(){const e=items[cursor];g=new C.ChessGame(R.movesToFens(A.gl.game.history)[e.ply-1]);orientation=e.side;selected=-1;done=false;answer=false;
 $('retry-feedback').className='retry-feedback';$('retry-feedback').textContent='Выберите фигуру и исправленный ход.';draw();}
function start(){items=I.retryCandidates(A.gl.review,A.gl.side);if(!items.length){A.toast('Нет ошибок для исправления');return;}cursor=0;A.showModal('retry-modal');load();}
function close(){A.hideModal('retry-modal');items=[];g=null;}
function next(){if(cursor+1===items.length){A.toast('Работа над ошибками завершена');close();return;}cursor++;load();}
function press(i){if(!g||done||answer)return;const p=g.board[i];if(selected>=0){const found=g.legalMoves().filter(m=>m.from===selected&&m.to===i);if(found.length){const move=found.find(m=>m.promotion==='q')||found[0],uci=C.square(selected)+C.square(i)+(move.promotion||'');selected=-1;
 if(I.acceptableRetry(items[cursor],uci)){g.move(uci.slice(0,2),uci.slice(2,4),uci[4]||'q');done=true;$('retry-feedback').className='retry-feedback correct';$('retry-feedback').textContent='Верно! '+items[cursor].comment;}
 else {$('retry-feedback').className='retry-feedback wrong';$('retry-feedback').textContent='Это не один из лучших вариантов. Попробуйте ещё раз или откройте решение.';}draw();return;}}
 selected=p&&C.color(p)===g.turn?i:-1;draw();}
$('retry-start').addEventListener('click',start);$('retry-close').addEventListener('click',close);$('retry-next').addEventListener('click',next);
$('retry-solution').addEventListener('click',()=>{answer=true;const e=items[cursor];$('retry-feedback').textContent=`Лучший ход: ${e.best.slice(0,2)} → ${e.best.slice(2,4)}. ${e.comment}`;draw();});
$('retry-board').addEventListener('click',ev=>{const el=ev.target.closest('[data-retry-square]');if(el)press(+el.dataset.retrySquare);});
window.OfflineChessRetry={start,close};
})();

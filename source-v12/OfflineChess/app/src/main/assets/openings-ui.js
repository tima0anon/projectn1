(function(){'use strict';
const A=window.OfflineChessApp,I=window.OfflineChessInsights,C=window.OfflineChessCore,$=id=>document.getElementById(id);let picked=null,ply=0;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function showCurrent(){const o=I.lookupOpening(A.gl.game.history),moves=I.openingContinuations(A.gl.game.history).slice(0,6);
 $('opening-current').innerHTML=`<b>Текущая партия: </b>${o?esc(o.eco+' · '+o.name):'дебют не определён'}<p>${moves.length?'Продолжения из базы: '+moves.map(m=>m.uci.slice(0,2)+'–'+m.uci.slice(2,4)).join(', '):'Продолжений в справочнике нет.'}</p>`;}
function list(){const v=I.openingSearch($('opening-search').value);$('opening-count').textContent=v.length+' вариантов';
 $('opening-list').innerHTML=v.map(o=>`<button class="opening-item" data-opening="${I.OPENINGS.indexOf(o)}"><strong>${esc(o.name)}</strong><small>${o.eco} · ${Math.ceil(o.line.length/2)} ходов</small></button>`).join('')||'<div class="empty-history">Ничего не найдено</div>';
 $('opening-list').querySelectorAll('[data-opening]').forEach(b=>b.addEventListener('click',()=>{picked=I.OPENINGS[+b.dataset.opening];ply=picked.line.length;preview();$('opening-preview').scrollIntoView?.({behavior:'smooth',block:'start'});}));}
function preview(){if(!picked)return;$('opening-preview').hidden=false;const g=new C.ChessGame(),san=[];
 for(const u of picked.line){const m=g.move(u.slice(0,2),u.slice(2,4),u[4]||'q');if(!m)break;san.push(m.san);}
 const board=new C.ChessGame();for(const u of picked.line.slice(0,ply))board.move(u.slice(0,2),u.slice(2,4),u[4]||'q');const last=board.history.at(-1);
 $('opening-preview-title').textContent=picked.eco+' · '+picked.name;
 $('opening-preview-board').innerHTML=board.board.map((p,i)=>`<div class="cell ${((i>>3)+(i&7))%2?'dark':'light'}${last&&(i===last.from||i===last.to)?' last':''}">${p?A.pieceHtml(p):''}</div>`).join('');
 $('opening-ply').textContent=ply+' / '+picked.line.length;$('opening-prev').disabled=ply===0;$('opening-next').disabled=ply===picked.line.length;
 $('opening-preview-moves').innerHTML=san.map((s,i)=>`<button data-ply="${i+1}" class="${ply===i+1?'selected':''}">${i%2===0?Math.floor(i/2)+1+'. ':''}${esc(s)}</button>`).join('');
 $('opening-preview-moves').querySelectorAll('[data-ply]').forEach(b=>b.addEventListener('click',()=>{ply=+b.dataset.ply;preview();}));}
$('opening-search').addEventListener('input',list);
$('opening-prev').addEventListener('click',()=>{ply--;preview();});
$('opening-next').addEventListener('click',()=>{ply++;preview();});
document.querySelector('[data-screen="openings"]').addEventListener('click',()=>{showCurrent();list();});list();
})();

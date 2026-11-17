/* Game report UI. No network or account; requests engine analysis from native Android bridge. */
(function(){'use strict';
const app=window.OfflineChessApp,core=window.OfflineChessCore,R=window.OfflineChessReview,gl=app.gl;
const $=id=>document.getElementById(id);
let serial=0,status='idle',fens=[],raw=[],selectedPly=0,quality='fast',showBest=false,reportError=null;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asNumber=x=>Number.isFinite(x)?x:0;
const percentage=p=>p===null?'—':p.toFixed(1)+'%';
function cancelProcessing(){if(status==='running'){const old=serial;serial++;try{window.Android?.cancelReview?.(old);}catch(e){}status='idle';} }
function invalidate(){cancelProcessing();gl.review=null;raw=[];fens=[];reportError=null;status='idle';}
window.OfflineChessReviewUI={invalidate};
function openReview(){app.hideModal('result-modal');app.screen('review');showReport();}
function setQuality(level){quality=level;$('review-fast').classList.toggle('selected',quality==='fast');$('review-deep').classList.toggle('selected',quality==='deep');}
function updateProgress(){
 const done=raw.filter(Boolean).length,total=fens.length;
 $('review-progress-title').textContent=reportError?'Завершение анализа…':'Анализ партии…';
 $('review-progress-fill').style.width=(total?Math.round(done*100/total):0)+'%';
 $('review-progress-caption').textContent=`${done} из ${total} позиций · ${total?Math.round(done*100/total):0}%`;
}
function showReport(){
 $('review-empty').hidden=!!gl.review||status==='running';
 $('review-report').hidden=!gl.review||status==='running';
 $('review-progress').hidden=status!=='running';
 $('review-start').textContent=gl.review?'Повторить анализ':'Анализировать партию';
 $('review-start').disabled=status==='running';
 $('review-controls').hidden=status==='running';
 if(status==='running'){updateProgress();return;}
 if(!gl.review){$('review-empty').textContent=gl.game.history.length?'Нажмите «Анализировать партию» для отчёта.':'Сыграйте хотя бы один ход, чтобы открыть разбор партии.';return;}
 renderReport();
}
function startReview(){
 if(status==='running')return;
 if(!gl.game.history.length){app.toast('Сначала сделайте ход');return;}
 try{fens=R.movesToFens(gl.game.history);}catch(e){app.toast('Повреждённая партия');return;}
 serial++;raw=Array(fens.length).fill(null);status='running';reportError=null;selectedPly=Math.min(gl.game.history.length,Math.max(1,selectedPly));showBest=false;
 showReport();
 const native=!!(window.Android&&window.Android.engineAvailable?.()&&window.Android.requestReview);
 if(native){
  try{window.Android.requestReview(JSON.stringify(fens),serial,quality==='deep'?650:180);return;}
  catch(e){reportError='Stockfish не запустился';}
 }
 fallbackMissing(serial);
}
function fallbackMissing(id){
 if(status!=='running'||id!==serial)return;
 const i=raw.findIndex(x=>x===null);
 if(i<0){completeReview(id);return;}
 try{raw[i]=R.fallbackPosition(fens[i]);}
 catch(e){console.error(e);status='idle';app.toast('Ошибка при анализе позиции');showReport();return;}
 if(i%3===0||i===fens.length-1)updateProgress();
 setTimeout(()=>fallbackMissing(id),0);
}
window.reviewPositionResult=function(id,i,result){
 if(id!==serial||status!=='running'||!Number.isInteger(i)||i<0||i>=raw.length)return;
 if(!result||!Number.isFinite(result.score))return;
 const terminal=new core.ChessGame(fens[i]).outcome();
 if(terminal)result={score:terminal.kind==='mate'?(terminal.winner==='w'?9999:-9999):0,lines:[]};
 raw[i]=result;
 updateProgress();
};
window.reviewFinished=function(id,error){
 if(id!==serial||status!=='running')return;
 if(error){reportError=error;fallbackMissing(id);return;}
 if(raw.includes(null)){reportError='Некоторые позиции не оценены';fallbackMissing(id);return;}
 completeReview(id);
};
function completeReview(id){
 if(id!==serial||status!=='running')return;
 try{
  const engine=window.Android?.engineAvailable?.()&&!reportError?'stockfish':'approx';
  const report=R.buildReview(gl.game.history,raw,engine,quality);
  gl.review=report;
  for(const entry of report.entries){
   const historyMove=gl.game.history[entry.ply-1];
   historyMove.annotation={kind:entry.kind,loss:entry.loss,best:entry.best?{from:entry.best.slice(0,2),to:entry.best.slice(2,4)}:null,accuracy:entry.accuracy};
  }
  status='ready';
  if(gl.gameId)app.saveToList(true);else app.persistCurrent();
  app.render();showReport();
 }catch(e){console.error(e);status='idle';app.toast('Не удалось создать отчёт');showReport();}
}
function selectPly(ply){selectedPly=Math.max(0,Math.min(gl.review.entries.length,ply));showBest=false;renderSelection();}
function arrowOverlay(from,to){
 const a=core.index(from),b=core.index(to);if(a<0||b<0)return '';
 const transform=i=>{let r=Math.floor(i/8),c=i%8;if(gl.orientation==='b'){r=7-r;c=7-c;}return [12.5*(c+.5),12.5*(r+.5)];};
 const [x1,y1]=transform(a),[x2,y2]=transform(b),ang=Math.atan2(y2-y1,x2-x1),xx=x2-4*Math.cos(ang),yy=y2-4*Math.sin(ang);
 return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="review-arrow"><defs><marker id="review-tip" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4Z" fill="#f0b44e"/></marker></defs><path d="M ${x1} ${y1} L ${xx} ${yy}" stroke="#f0b44e" stroke-width="2.6" stroke-linecap="round" opacity=".92" marker-end="url(#review-tip)" /></svg>`;
}
function renderReviewBoard(){
 const displayPly=showBest?Math.max(0,selectedPly-1):selectedPly;
 const g=app.gameAt(displayPly),last=g.history[g.history.length-1],cells=[];
 const threatened=g.check()?g.kingSquare(g.turn):-1;
 for(let vis=0;vis<64;vis++){
  const r=Math.floor(vis/8),c=vis%8,i=gl.orientation==='w'?vis:63-vis,p=g.board[i];
  let cls='cell '+((r+c)%2===0?'light':'dark');
  if(last&&(i===last.from||i===last.to))cls+=' last';
  if(i===threatened)cls+=' check';
  const row=gl.orientation==='w'?8-r:r+1;
  const file=gl.orientation==='w'?'abcdefgh'[c]:'hgfedcba'[c];
  cells.push(`<div class="${cls}">${p?app.pieceHtml(p):''}${c===0?`<span class="coord rank">${row}</span>`:''}${r===7?`<span class="coord file">${file}</span>`:''}</div>`);
 }
 const selected=gl.review.entries[selectedPly-1];
 const arrow=showBest&&selected?.best?arrowOverlay(selected.best.slice(0,2),selected.best.slice(2,4)):'';
 $('review-board').innerHTML=cells.join('')+arrow;
}
function drawChart(){
 const arr=gl.review.positions,entries=gl.review.entries;
 if(arr.length<2){$('review-chart').innerHTML='';return;}
 const w=780,h=175,left=14,right=14,top=14,bottom=19;
 const x=i=>left+i*(w-left-right)/(arr.length-1);
 const y=cp=>top+(h-top-bottom)*(1-(Math.max(-800,Math.min(800,cp))+800)/1600);
 const path=arr.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(asNumber(p.score)).toFixed(1)}`).join(' ');
 const middle=y(0).toFixed(1);
 const markers=entries.map((entry,i)=>`<circle data-review-ply="${i+1}" class="graph-point kind-${entry.kind}" cx="${x(i+1).toFixed(1)}" cy="${y(asNumber(arr[i+1].score)).toFixed(1)}" r="${i+1===selectedPly?5.5:3.4}"><title>${i+1}. ${safe(entry.san)} · ${safe(R.LABELS[entry.kind])}</title></circle>`).join('');
 $('review-chart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="График преимущества белых и чёрных"><rect x="0" y="0" width="${w}" height="${middle}" class="graph-white"/><rect x="0" y="${middle}" width="${w}" height="${h-middle}" class="graph-black"/><line x1="0" x2="${w}" y1="${middle}" y2="${middle}" class="graph-center"/><path d="${path}" class="graph-line"/>${markers}<text x="7" y="14" class="graph-caption">Белые +</text><text x="7" y="${h-5}" class="graph-caption">Чёрные −</text></svg>`;
 $('review-chart').querySelectorAll('[data-review-ply]').forEach(b=>b.addEventListener('click',()=>selectPly(+b.getAttribute('data-review-ply'))));
}
function renderStats(){
 const r=gl.review;
 $('review-source-note').textContent=r.engine==='stockfish'?'Оценки Stockfish (офлайн). Точность и категории вычислены по собственной приближённой модели — это не алгоритм Chess.com.':'Приблизительный разбор встроенным анализатором. Для точной оценки установите Stockfish при сборке APK.';
 $('review-accuracy').innerHTML=['w','b'].map((side,i)=>`<div class="accuracy-card ${side}"><small>${i?'Чёрные':'Белые'}</small><strong>${percentage(r.totals[side].accuracy)}</strong><span>Точность · ${r.totals[side].moves} ходов</span></div>`).join('');
 const ratings=['w','b'].map(side=>`${side==='w'?'Белые':'Чёрные'}: <strong>${r.totals[side].estimatedElo??'—'}</strong>`).join(' · ');
 $('review-rating').innerHTML=`<b>Оценка силы за партию</b><div>${ratings}</div><small>Приблизительная оценка, не официальный Elo. Требуется не менее 6 ходов каждой стороны.</small>`;
 $('review-opening').textContent=r.opening?`${r.opening.eco} · ${r.opening.name}`:'Дебют не определён';
 const retry=window.OfflineChessInsights.retryCandidates(r,gl.side);$('retry-start').disabled=retry.length===0;$('retry-start').textContent=retry.length?`↻ Исправить свои ошибки (${retry.length})`:'↻ Нет ошибок для исправления';
 const title=['brilliant','best','excellent','good','inaccuracy','mistake','blunder'];
 $('review-stats').innerHTML='<div class="stats-cols"><span>Категория</span><span>Белые</span><span>Чёрные</span></div>'+title.map(kind=>`<div class="stats-row"><span><i class="kind-${kind}">${R.MARKS[kind]}</i>${R.LABELS[kind]}</span><b>${r.totals.w.counts[kind]}</b><b>${r.totals.b.counts[kind]}</b></div>`).join('');
}
function renderReport(){
 if(!gl.review)return;
 selectedPly=Math.min(selectedPly,gl.review.entries.length);
 renderStats();drawChart();
 const entries=gl.review.entries,rows=[];
 for(let i=0;i<entries.length;i+=2){
  const cols=[entries[i],entries[i+1]].map(e=>e?`<button data-review-move="${e.ply}" class="history-move ${e.ply===selectedPly?'current':''}"><em class="tag-${e.kind}">${R.MARKS[e.kind]}</em>${safe(e.san)}</button>`:'<span></span>');
  rows.push(`<div class="move-row"><span class="move-num">${i/2+1}.</span>${cols.join('')}</div>`);
 }
 $('review-history').innerHTML=rows.join('');
 $('review-history').querySelectorAll('[data-review-move]').forEach(b=>b.addEventListener('click',()=>selectPly(+b.dataset.reviewMove)));
 renderSelection();
}
function renderSelection(){
 if(!gl.review)return;
 renderReviewBoard();
 drawChart();
 const entries=gl.review.entries,e=entries[selectedPly-1];
 $('review-ply-label').textContent=selectedPly?`Ход ${Math.ceil(selectedPly/2)} · ${selectedPly%2?'Белые':'Чёрные'}`:'Начало партии';
 $('review-prev').disabled=selectedPly===0;$('review-next').disabled=selectedPly>=entries.length;
 $('review-best').disabled=!e?.best;
 $('review-best').textContent=showBest?'Показать сыгранный ход':'Показать лучший ход на доске';
 if(e){
  $('review-move-title').textContent=`${R.MARKS[e.kind]} ${e.san} · ${R.LABELS[e.kind]}`;
  $('review-comment').textContent=`Точность хода ${e.accuracy.toFixed(1)}%. ${e.comment}${e.motifs?.length?' Тактические признаки: '+e.motifs.join(', ')+'.':''}`;
  $('review-variations').innerHTML=(e.alternatives||[]).map((alt,i)=>{
   const san=R.variationSan(gl.review.positions.length?fens[selectedPly-1]||R.movesToFens(gl.game.history)[selectedPly-1]:'',alt.pv);
   return `<div class="variation-line"><span>${i===0?'Лучший ход':`Вариант ${i+1}`}</span><b>${safe(san||alt.uci)}</b><small>${R.scoreLabel(asNumber(alt.score))}</small></div>`;
  }).join('')||'<p class="variation-none">Данные о вариантах отсутствуют.</p>';
 }else{
  $('review-move-title').textContent='Начальная позиция';$('review-comment').textContent='Выберите ход в списке или на графике.';
  $('review-variations').innerHTML='';
 }
 $('review-history').querySelectorAll('[data-review-move]').forEach(b=>b.classList.toggle('current',+b.dataset.reviewMove===selectedPly));
}
function buildTextReport(){
 const r=gl.review;
 if(!r)return '';
 const lines=['Офлайн-шахматы — отчёт о партии',`Анализ: ${r.engine==='stockfish'?'Stockfish':'приблизительный'}, режим: ${r.quality==='deep'?'точный':'быстрый'}`,'Оценка точности — приблизительная, не Chess.com.',`Дебют: ${r.opening?.name||'не определён'}`,`Условный Elo белых: ${r.totals.w.estimatedElo??'мало ходов'}`,`Условный Elo чёрных: ${r.totals.b.estimatedElo??'мало ходов'}`,'','Точность белых: '+percentage(r.totals.w.accuracy),'Точность чёрных: '+percentage(r.totals.b.accuracy),''];
 for(const kind of R.KINDS)lines.push(`${R.LABELS[kind]}: белые ${r.totals.w.counts[kind]}, чёрные ${r.totals.b.counts[kind]}`);
 lines.push('','Ходы:');for(const e of r.entries)lines.push(`${Math.ceil(e.ply/2)}${e.side==='w'?'.':'...'} ${e.san} — ${R.LABELS[e.kind]}, ${e.accuracy.toFixed(1)}%, оценка ${R.scoreLabel(e.eval)}${e.best?' / лучший '+e.best:''}`);
 return lines.join('\n');
}
function exportReview(){const report=buildTextReport();if(!report)return;
 if(window.Android?.copyText){window.Android.copyText(report);app.toast('Отчёт скопирован');return;}
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(report).then(()=>app.toast('Отчёт скопирован')).catch(()=>app.toast('Копирование недоступно'));
 else app.toast('Копирование недоступно');
}
$('open-review').addEventListener('click',openReview);
$('result-review').addEventListener('click',openReview);
document.querySelector('[data-screen="review"]').addEventListener('click',showReport);
$('review-start').addEventListener('click',startReview);
$('review-fast').addEventListener('click',()=>setQuality('fast'));
$('review-deep').addEventListener('click',()=>setQuality('deep'));
$('review-cancel').addEventListener('click',()=>{cancelProcessing();showReport();});
$('review-prev').addEventListener('click',()=>selectPly(selectedPly-1));
$('review-next').addEventListener('click',()=>selectPly(selectedPly+1));
$('review-best').addEventListener('click',()=>{showBest=!showBest;renderSelection();});
$('review-export').addEventListener('click',exportReview);
if(gl.review)selectedPly=Math.min(gl.review.entries.length,1);
showReport();
})();

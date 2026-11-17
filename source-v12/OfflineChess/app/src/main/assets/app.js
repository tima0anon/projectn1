(function(){'use strict';
const {ChessGame,square,index,color,type,evalBoard,engineMove,analyzeMove}=window.OfflineChessCore;
const Insights=window.OfflineChessInsights;
const $=id=>document.getElementById(id);
const gl={review:null,game:new ChessGame(),side:'w',orientation:'w',mode:'play',elo:1200,setupMode:'play',setupColor:'w',setupElo:1200,selected:-1,legal:[],busy:false,replay:null,requestId:0,lastHint:null,gameId:null,started:Date.now(),toastTimer:null};
const symbols={p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'};
const classification={brilliant:['!!','Блестящий ход','Сильная жертва материала с достаточной компенсацией.'],best:['★','Лучший ход','Точно! Это один из лучших ходов.'],excellent:['✓','Отличный ход','Хорошее решение — позиция осталась сильной.'],good:['✓','Хороший ход','Неплохое продолжение.'],inaccuracy:['?!','Неточность','Был более сильный вариант.'],mistake:['?','Ошибка','Позиция заметно ухудшилась.'],blunder:['??','Грубая ошибка','Значительная потеря преимущества или материала.']};
const modeNames={play:'Игра',practice:'Практика',coach:'Тренер'};
const isNative=()=>!!(window.Android&&typeof window.Android.engineAvailable==='function'&&window.Android.engineAvailable());
const pieceHtml=p=>`<span class="piece ${color(p)}"><img draggable="false" alt="" src="pieces/${color(p)}${type(p)}.svg"></span>`;
const normalize=n=>Math.max(0,Math.min(64,Math.floor(n)));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(gl.toastTimer);gl.toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}
function showModal(name){$(name).hidden=false;}function hideModal(name){$(name).hidden=true;}
function gameAt(ply){if(ply===null)return gl.game;const view=new ChessGame();for(const h of gl.game.history.slice(0,ply))view.move(h.fromSquare,h.toSquare,h.promotion);return view;}
function screen(name){document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id==='screen-'+name));document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.screen===name));if(name==='saves')renderSaves();}
function position(i){const r=Math.floor(i/8),c=i%8;return gl.orientation==='w'?{r,c}:{r:7-r,c:7-c};}
function renderBoard(){
 const g=gameAt(gl.replay),board=$('board'),moves=gl.replay===null&&g.turn===gl.side&&!gl.busy?g.legalMoves():[],selMoves=moves.filter(m=>m.from===gl.selected),last=g.history[g.history.length-1],inCheck=g.check()?g.kingSquare(g.turn):-1;
 const list=[];
 for(let vis=0;vis<64;vis++){
  const r=Math.floor(vis/8),c=vis%8,i=gl.orientation==='w'?vis:63-vis,p=g.board[i],base=(r+c)%2===0?'light':'dark';
  let cls='cell '+base;if(last&&(i===last.from||i===last.to))cls+=' last';if(i===gl.selected)cls+=' selected';if(i===inCheck)cls+=' check';
  const possible=selMoves.find(m=>m.to===i);if(possible)cls+=' legal'+(p?' capture':'');
  const file=gl.orientation==='w'?'abcdefgh'[c]:'hgfedcba'[c],rank=gl.orientation==='w'?8-r:r+1;
  list.push(`<div class="${cls}" data-i="${i}" role="button" aria-label="${square(i)}${p?' '+p:''}">${p?pieceHtml(p):''}${c===0?`<span class="coord rank">${rank}</span>`:''}${r===7?`<span class="coord file">${file}</span>`:''}</div>`);
 }
 board.innerHTML=list.join('')+'<div id="arrow-layer"></div>';
 if(gl.lastHint)drawArrow(gl.lastHint.from,gl.lastHint.to);
}
function drawArrow(a,b){if(typeof a==='string')a=index(a);if(typeof b==='string')b=index(b);if(a<0||b<0)return;const A=position(a),B=position(b),x1=(A.c+.5)*12.5,y1=(A.r+.5)*12.5,x2=(B.c+.5)*12.5,y2=(B.r+.5)*12.5,angle=Math.atan2(y2-y1,x2-x1),endx=x2-Math.cos(angle)*4,endy=y2-Math.sin(angle)*4;
 $('arrow-layer').innerHTML=`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="arr" markerWidth="4" markerHeight="4" refX="2.1" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4Z" fill="#e8a94d"/></marker></defs><path d="M ${x1} ${y1} L ${endx} ${endy}" stroke="#e8a94d" stroke-width="2.5" stroke-linecap="round" marker-end="url(#arr)" opacity=".9"/></svg>`;
}
function animateMove(m,piece){const layer=$('fly-layer');layer.innerHTML='';const A=position(m.from),B=position(m.to);const el=document.createElement('div');el.className='fly-piece';el.style.left=(A.c*12.5)+'%';el.style.top=(A.r*12.5)+'%';el.innerHTML=pieceHtml(piece);layer.append(el);
 const target=$('board').querySelector(`[data-i="${m.to}"] .piece`);if(target)target.style.visibility='hidden';requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.left=B.c*12.5+'%';el.style.top=B.r*12.5+'%';}));setTimeout(()=>{layer.innerHTML='';if(target)target.style.visibility='visible';},250);
}
function renderHistory(){const arr=gl.game.history,rows=[];for(let i=0;i<arr.length;i+=2){const cols=[arr[i],arr[i+1]].map((m,j)=>{if(!m)return '<span></span>';const ann=m.annotation,mark=ann?`<em class="tag-${ann.kind}">${classification[ann.kind]?.[0]||''}</em>`:'';const sel=gl.replay===i+j+1?' current':'';return `<button class="history-move${sel}" data-ply="${i+j+1}">${mark}${esc(m.san)}</button>`;});rows.push(`<div class="move-row"><span class="move-num">${i/2+1}.</span>${cols.join('')}</div>`);}const hist=$('move-history');hist.innerHTML=rows.join('')||'<div class="empty-history">Ходы появятся здесь</div>';if(gl.replay===null)hist.scrollTop=hist.scrollHeight;
 $('move-count').textContent=arr.length+' полуходов';$('replay-controls').hidden=gl.replay===null;
 hist.querySelectorAll('[data-ply]').forEach(btn=>btn.addEventListener('click',()=>{gl.replay=+btn.dataset.ply;gl.selected=-1;gl.lastHint=null;render();}));
}
function renderCoach(){const card=$('coach-card'),g=gameAt(gl.replay);card.classList.toggle('active',gl.mode!=='play');$('evaluation').style.display=gl.mode==='play'?'none':'flex';if(gl.mode==='play')return;
 const last=g.history[g.history.length-1],original=gl.game.history[(gl.replay===null?gl.game.history.length:gl.replay)-1];let title='Тренер',message='Выбирайте ходы на доске. Для подсказки нажмите «Подсказка».',ev=evalBoard(g);const reviewPos=gl.review?.positions?.[gl.replay===null?gl.game.history.length:gl.replay];if(reviewPos&&Number.isFinite(reviewPos.score))ev=reviewPos.score;
 if(original?.annotation){const ann=original.annotation,[,t,explain]=classification[ann.kind];title=`${classification[ann.kind][0]} ${t}`;message=gl.review?.entries?.[(gl.replay===null?gl.game.history.length:gl.replay)-1]?.comment||explain;if(ann.loss>30)message+=` Потеря оценки: около ${(ann.loss/100).toFixed(1)} пешки.`;if(ann.best)message+=` Рекомендация: ${ann.best.from} → ${ann.best.to}.`;}
 if(original&&!gl.review){const ply=gl.replay===null?gl.game.history.length:gl.replay;const motifs=Insights.detectMotifs(gameAt(ply-1),original,g).filter(t=>t!=="Взятие");if(motifs.length)message+=" Мотивы: "+motifs.join(", ")+".";}
 if(gl.lastHint)message=`Лучшее найденное продолжение: ${gl.lastHint.from} → ${gl.lastHint.to}.`;if(gl.replay!==null)message+=' (просмотр партии)';
 $('coach-title').textContent=title;$('coach-message').textContent=message;
 $('eval-caption').textContent=reviewPos&&gl.review.engine==='stockfish'?'Stockfish · анализ партии':'Приблизительная оценка';$('eval-fill').style.width=(100/(1+Math.exp(ev/320))).toFixed(1)+'%';$('eval-text').textContent=(ev>=0?'+':'')+(ev/100).toFixed(1);
}
function render(){const g=gameAt(gl.replay),out=g.outcome();renderBoard();renderHistory();renderCoach();const op=Insights.lookupOpening(g.history);$("opening-live").textContent=op?`${op.eco} · ${op.name}`:"Дебют пока не определён · ♙ Справочник";$('opponent-elo').textContent=gl.elo+' Elo';$('your-color').textContent=gl.side==='w'?'Белые':'Чёрные';$('opponent-label').textContent=isNative()&&gl.elo>=1400?'Stockfish':'Встроенный движок';$('engine-status').textContent=isNative()?'● Stockfish':'● Офлайн';$('engine-description').textContent=isNative()?'Движок: Stockfish (локально).':'Движок: встроенный JavaScript. Stockfish можно добавить при сборке.';$('game-status').textContent=gl.replay!==null?'Просмотр хода '+gl.replay:out?(out.kind==='mate'?'Мат':out.reason):gl.busy?'Компьютер думает…':g.turn===gl.side?'Ваш ход':'Ход соперника';$('you-turn').classList.toggle('on',!out&&g.turn===gl.side&&!gl.busy&&gl.replay===null);$('opponent-turn').classList.toggle('on',!out&&g.turn!==gl.side&&gl.replay===null);$('undo').disabled=gl.game.history.length===0;
 document.querySelectorAll('.mode-tab').forEach(b=>b.classList.toggle('selected',b.dataset.mode===gl.mode));
}
function clearSelection(){gl.selected=-1;gl.legal=[];gl.lastHint=null;}
function handleSquare(i){if(gl.replay!==null||gl.busy||gl.game.outcome()||gl.game.turn!==gl.side)return;
 const g=gl.game,p=g.board[i],legal=g.legalMoves();
 if(gl.selected>=0){const choice=legal.filter(m=>m.from===gl.selected&&m.to===i);if(choice.length){if(choice.some(m=>m.promotion)){gl.pendingPromotion={from:gl.selected,to:i};renderPromotion();return;}play(gl.selected,i,'q',false);return;}}
 if(p&&color(p)===gl.side){gl.selected=i;gl.lastHint=null;renderBoard();}else{clearSelection();renderBoard();}
}
let pointerDown=null;let dragMoved=false;function bindBoard(){const bd=$('board');bd.addEventListener('pointerdown',e=>{const cell=e.target.closest('[data-i]');if(!cell)return;pointerDown={i:+cell.dataset.i,x:e.clientX,y:e.clientY};dragMoved=false;});bd.addEventListener('pointerup',e=>{if(!pointerDown)return;const src=pointerDown;pointerDown=null;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-i]');if(!el)return;const target=+el.dataset.i,dist=Math.hypot(e.clientX-src.x,e.clientY-src.y);if(dist>10&&src.i!==target){dragMoved=true;if(gl.selected!==src.i){gl.selected=src.i;}handleSquare(target);}else handleSquare(target);});}
function play(from,to,promotion,ai){if(gl.game.outcome())return;window.OfflineChessReviewUI?.invalidate();const before=gl.game.copy(),originPiece=gl.game.board[typeof from==='string'?index(from):from];const m=gl.game.move(from,to,promotion);if(!m)return;clearSelection();
 if(gl.mode!=='play'){try{m.annotation=analyzeMove(before,m,gl.mode==='coach'?2:1);}catch(err){console.warn('Analyzer:',err.message);}}
 gl.replay=null;render();animateMove(m,originPiece);persistCurrent();
 const end=gl.game.outcome();if(end){gl.busy=false;render();setTimeout(()=>showResult(end),350);saveToList(true);return;}
 if(!ai){gl.busy=true;render();setTimeout(aiTurn,370);}else{gl.busy=false;render();}
}
function aiTurn(){if(gl.game.outcome()||gl.game.turn===gl.side){gl.busy=false;render();return;}
 const id=++gl.requestId;
 if(isNative()&&gl.elo>=1400){
  try{window.Android.requestMove(gl.game.fen(),gl.elo,id);return;}catch(e){console.error(e);}
 }
 setTimeout(()=>{if(gl.requestId!==id)return;const ans=engineMove(gl.game,gl.elo);if(ans)play(ans.move.from,ans.move.to,ans.move.promotion||'q',true);else{gl.busy=false;render();}},35);
}
window.stockfishResult=function(id,uci,score){if(id!==gl.requestId)return;if(!uci||uci.length<4){const ans=engineMove(gl.game,gl.elo);if(ans)play(ans.move.from,ans.move.to,ans.move.promotion||'q',true);else{gl.busy=false;render();}return;}
 const from=uci.slice(0,2),to=uci.slice(2,4),promotion=uci.slice(4)||'q';if(!gl.game.legalMoves().some(m=>m.from===index(from)&&m.to===index(to)&&(!m.promotion||m.promotion===promotion))){console.warn('Stockfish sent invalid move',uci);return window.stockfishResult(id,null,null);}play(from,to,promotion,true);
};
function renderPromotion(){const chooser=$('promotion-choices');const clr=gl.side;chooser.innerHTML=['q','r','b','n'].map(t=>`<button data-prom="${t}">${pieceHtml(clr==='w'?t.toUpperCase():t)}</button>`).join('');chooser.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{hideModal('promotion-modal');const x=gl.pendingPromotion;gl.pendingPromotion=null;play(x.from,x.to,btn.dataset.prom,false);}));showModal('promotion-modal');}
function undo(){window.OfflineChessReviewUI?.invalidate();gl.requestId++;gl.busy=false;gl.replay=null;gl.lastHint=null;gl.game.undo();if(gl.game.turn!==gl.side)gl.game.undo();clearSelection();render();persistCurrent();toast('Ход отменён');}
function hint(){if(gl.mode==='play'){toast('Подсказки доступны в практике и у тренера');return;}if(gl.busy||gl.replay!==null||gl.game.outcome())return;const answer=engineMove(gl.game,2800);if(!answer)return;gl.lastHint={from:square(answer.move.from),to:square(answer.move.to)};renderBoard();renderCoach();toast('Подсказка на доске');}
function showResult(o){$('result-title').textContent=o.kind==='mate'?(o.winner===gl.side?'Победа!':'Поражение'):'Ничья';$('result-reason').textContent=o.kind==='mate'?'Мат. Партия завершена.':o.reason;showModal('result-modal');}
function persistCurrent(){try{localStorage.setItem('offlinechess_current',JSON.stringify({...gl.game.exportData(),side:gl.side,elo:gl.elo,mode:gl.mode,gameId:gl.gameId,started:gl.started,review:gl.review}));}catch(e){console.error(e);}}
function listSaved(){try{return JSON.parse(localStorage.getItem('offlinechess_saves')||'[]');}catch(e){return [];}}
function saveToList(silent=false){try{let saves=listSaved();let id=gl.gameId||'game_'+Date.now()+'_'+Math.floor(Math.random()*10000);gl.gameId=id;const obj={id,date:new Date().toISOString(),side:gl.side,elo:gl.elo,mode:gl.mode,moves:gl.game.exportData().moves,review:gl.review};const at=saves.findIndex(s=>s.id===id);if(at>=0)saves.splice(at,1);saves.unshift(obj);localStorage.setItem('offlinechess_saves',JSON.stringify(saves.slice(0,100)));persistCurrent();if(!silent)toast('Партия сохранена');}catch(err){toast('Ошибка сохранения');}}
function renderSaves(){const holder=$('saved-games'),data=listSaved();holder.innerHTML=data.length?data.map(s=>`<div class="saved-card"><div class="saved-icon">${s.side==='w'?'♔':'♚'}</div><div class="saved-content"><b>${esc(modeNames[s.mode]||'Игра')} · ${s.elo} Elo</b><small>${new Date(s.date).toLocaleDateString('ru-RU')} · ${Math.ceil((s.moves||[]).length/2)} ходов</small></div><button class="saved-open" data-load="${esc(s.id)}">Открыть</button><button class="saved-delete" data-delete="${esc(s.id)}">✕</button></div>`).join(''):'<div class="empty-history">Сохранённых партий пока нет</div>';
 holder.querySelectorAll('[data-load]').forEach(b=>b.addEventListener('click',()=>{window.OfflineChessReviewUI?.invalidate();const x=listSaved().find(s=>s.id===b.dataset.load);if(!x)return;gl.game=new ChessGame();try{gl.game.importData({moves:x.moves});}catch(e){toast('Ошибка чтения партии');return;}gl.mode=x.mode;gl.side=x.side;gl.orientation=x.side;gl.elo=x.elo;gl.gameId=x.id;gl.review=x.review?.entries?.length===gl.game.history.length?x.review:null;gl.busy=false;gl.replay=null;gl.requestId++;clearSelection();screen('game');render();if(!gl.game.outcome()&&gl.game.turn!==gl.side){gl.busy=true;render();setTimeout(aiTurn,350);}}));
 holder.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{localStorage.setItem('offlinechess_saves',JSON.stringify(listSaved().filter(x=>x.id!==b.dataset.delete)));renderSaves();}));
}
function newGame(){window.OfflineChessReviewUI?.invalidate();gl.requestId++;gl.setupElo=normalizeElo(gl.setupElo);gl.elo=gl.setupElo;gl.mode=gl.setupMode;gl.side=gl.setupColor==='random'?(Math.random()<.5?'w':'b'):gl.setupColor;gl.orientation=gl.side;gl.game=new ChessGame();gl.gameId=null;gl.review=null;gl.started=Date.now();gl.replay=null;gl.busy=false;clearSelection();hideModal('new-modal');screen('game');persistCurrent();render();if(gl.side==='b'){gl.busy=true;render();setTimeout(aiTurn,500);}}
function normalizeElo(n){return Math.min(2800,Math.max(400,Number(n)||1200));}
function loadCurrent(){try{const s=JSON.parse(localStorage.getItem('offlinechess_current')||'null');if(!s)return;gl.game=new ChessGame();gl.game.importData(s);gl.side=s.side||'w';gl.orientation=gl.side;gl.elo=s.elo||1200;gl.mode=s.mode||'play';gl.gameId=s.gameId||null;gl.review=s.review?.entries?.length===gl.game.history.length?s.review:null;gl.started=s.started||Date.now();gl.setupMode=gl.mode;gl.setupColor=gl.side;gl.setupElo=gl.elo;}catch(e){console.warn(e);gl.game=new ChessGame();}}
function bindUI(){
 bindBoard();$('undo').addEventListener('click',undo);$('hint').addEventListener('click',hint);$('flip').addEventListener('click',()=>{gl.orientation=gl.orientation==='w'?'b':'w';renderBoard();toast('Доска перевёрнута');});$('save').addEventListener('click',()=>saveToList());
 $('open-new').addEventListener('click',()=>openSetup());$('new-from-saves').addEventListener('click',()=>openSetup());$('close-modal').addEventListener('click',()=>hideModal('new-modal'));$('start-game').addEventListener('click',newGame);$('result-new').addEventListener('click',()=>{hideModal('result-modal');openSetup();});$('result-close').addEventListener('click',()=>hideModal('result-modal'));
 document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>screen(b.dataset.screen)));
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(gl.mode===b.dataset.mode)return;gl.setupMode=b.dataset.mode;gl.setupColor=gl.side;gl.setupElo=gl.elo;openSetup();}));
 document.querySelectorAll('[data-setup-mode]').forEach(b=>b.addEventListener('click',()=>{gl.setupMode=b.dataset.setupMode;selectSetupOptions();}));
 document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{gl.setupColor=b.dataset.color;selectSetupOptions();}));
 $('elo-range').addEventListener('input',e=>{gl.setupElo=Number(e.target.value);$('elo-display').textContent=gl.setupElo+' Elo';});
 $('return-live').addEventListener('click',()=>{gl.replay=null;clearSelection();render();});
 $('copy-pgn').addEventListener('click',()=>{const pgn=gl.game.pgn();if(window.Android&&window.Android.copyText){window.Android.copyText(pgn);toast('PGN скопирован');return;}if(navigator.clipboard?.writeText){navigator.clipboard.writeText(pgn).then(()=>toast('PGN скопирован')).catch(()=>toast('Копирование недоступно'));}else toast('Копирование недоступно');});
 $('reset-games').addEventListener('click',()=>{localStorage.removeItem('offlinechess_saves');toast('Сохранения удалены');});
}
function selectSetupOptions(){document.querySelectorAll('[data-setup-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.setupMode===gl.setupMode));document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('selected',b.dataset.color===gl.setupColor));$('elo-range').value=gl.setupElo;$('elo-display').textContent=gl.setupElo+' Elo';}
function openSetup(){gl.setupMode=gl.setupMode||gl.mode;gl.setupColor=gl.setupColor||gl.side;gl.setupElo=gl.setupElo||gl.elo;selectSetupOptions();showModal('new-modal');}
window.OfflineChessApp={gl,screen,render,gameAt,persistCurrent,saveToList,toast,showModal,hideModal,clearSelection,position,pieceHtml};
loadCurrent();bindUI();render();if(gl.game.history.length===0&&!localStorage.getItem('offlinechess_current'))showModal('new-modal');else if(gl.game.turn!==gl.side&&!gl.game.outcome()){gl.busy=true;render();setTimeout(aiTurn,500);}
})();

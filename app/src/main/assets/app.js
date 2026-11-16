'use strict';
const $=id=>document.getElementById(id);
const names={p:'пешка',n:'конь',b:'слон',r:'ладья',q:'ферзь',k:'король'};
const qualities={
 best:{label:'Лучший ход',mark:'★'},excellent:{label:'Отличный ход',mark:'!'},good:{label:'Хороший ход',mark:'✓'},
 inaccuracy:{label:'Неточность',mark:'?!'},mistake:{label:'Ошибка',mark:'?'},blunder:{label:'Грубая ошибка',mark:'??'},
 forced:{label:'Вынужденный ход',mark:'='},missed:{label:'Упущенный мат',mark:'×'}
};
let game=new Chess(),human='w',elo=1200,mode='game',selected=null,busy=false,phase='',request=0,last=null,error='',savedId=null;
let reviews=[],awaiting=false,pendingReview=null,coachIndex=null,hintMove=null,drag=null,suppressClick=false,renderedHistoryCount=-1;
const pieceNodes=new Map();
function read(key,fallback){try{return JSON.parse(Native.read(key))||fallback;}catch(e){return fallback;}}
function uci(m){return m.from+m.to+(m.promotion||'');}
function moveList(g=game){return g.history({verbose:true}).map(uci).join(' ');}
function localSan(s){return s.replace(/^[KQRBN]/,c=>({K:'Кр',Q:'Ф',R:'Л',B:'С',N:'К'}[c]));}
function state(){return {moves:game.history(),human,elo,mode,reviews,awaiting,id:savedId};}
function persist(){Native.write('current',JSON.stringify(state()));}
function cancelWork(){Native.cancel();++request;busy=false;phase='';pendingReview=null;error='';awaiting=false;hintMove=null;}
function resetPieces(){pieceNodes.clear();$('pieces').textContent='';}
function contextForLast(){
 const h=game.history({verbose:true}),m=h[h.length-1];if(!m)return null;
 const before=new Chess();for(let i=0;i<h.length-1;i++)before.move(h[i]);
 return {ply:h.length-1,side:m.color,move:uci(m),san:m.san,beforeFen:before.fen(),afterFen:game.fen(),beforeMoves:moveList(before),legal:before.moves().length,checkmate:game.in_checkmate(),draw:game.in_draw()};
}
function restore(s){
 cancelWork();game=new Chess();human=s.human==='b'?'b':'w';elo=Math.max(400,Math.min(3000,Number(s.elo)||1200));
 mode=['game','learn','practice'].includes(s.mode)?s.mode:'game';savedId=s.id||null;selected=null;coachIndex=null;
 for(const m of s.moves||[])if(!game.move(m))throw Error('Повреждена партия');
 const h=game.history({verbose:true});reviews=(s.reviews||[]).slice(0,h.length).map((r,i)=>r&&r.uci===uci(h[i])?r:null);
 last=h.slice(-1)[0]||null;
 awaiting=mode==='learn'&&!!s.awaiting&&!!last&&last.color===human&&game.turn()!==human&&!game.game_over()&&!!reviews[h.length-1];
 renderedHistoryCount=-1;resetPieces();render();persist();resume();
}
function resume(){
 const ctx=contextForLast();
 if(mode!=='game'&&ctx&&!reviews[ctx.ply]&&!awaiting){startReview(ctx);return;}
 think();
}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2300);}
function coordinates(sq){
 const file=sq.charCodeAt(0)-97,rank=Number(sq[1]);
 return human==='w'?{x:file,y:8-rank}:{x:7-file,y:rank-1};
}
function transformFor(sq){const p=coordinates(sq);return 'translate('+p.x*100+'%,'+p.y*100+'%)';}
function pieceSrc(p){return 'pieces/'+p.color+p.type.toUpperCase()+'.svg';}
function removeNode(sq,fade){
 const node=pieceNodes.get(sq);if(!node)return;
 pieceNodes.delete(sq);
 if(fade){node.classList.add('captured');setTimeout(()=>node.remove(),180);}else node.remove();
}
function slide(from,to){
 const node=pieceNodes.get(from);if(!node)return;
 removeNode(to,true);pieceNodes.delete(from);pieceNodes.set(to,node);node.style.transform=transformFor(to);
}
function syncPieces(m){
 if(m){
  if(m.flags.includes('e'))removeNode(m.to[0]+m.from[1],true);
  slide(m.from,m.to);
  if(m.flags.includes('k'))slide('h'+m.from[1],'f'+m.from[1]);
  if(m.flags.includes('q'))slide('a'+m.from[1],'d'+m.from[1]);
 }
 for(const [sq,node]of pieceNodes){if(!game.get(sq)){pieceNodes.delete(sq);node.remove();}}
 for(let rank=1;rank<=8;rank++)for(const file of 'abcdefgh'){
  const sq=file+rank,p=game.get(sq);if(!p)continue;
  let node=pieceNodes.get(sq);
  if(!node){node=document.createElement('img');node.className='piece';node.draggable=false;node.alt='';node.style.transform=transformFor(sq);$('pieces').appendChild(node);pieceNodes.set(sq,node);}
  if(node.getAttribute('src')!==pieceSrc(p))node.setAttribute('src',pieceSrc(p));
  node.dataset.square=sq;if(!drag||drag.node!==node)node.style.transform=transformFor(sq);
 }
}
function qualityIcon(key){
 const q=qualities[key],span=document.createElement('span');span.className='quality '+key;span.textContent=q.mark;span.title=q.label;span.setAttribute('aria-label',q.label);return span;
}
function statusText(){
 if(busy)return phase==='review'?'Тренер оценивает ход…':'Stockfish думает…';
 if(game.in_checkmate())return game.turn()===human?'Мат. Победил Stockfish':'Мат. Вы победили!';
 if(game.in_stalemate())return 'Пат — ничья';
 if(game.in_threefold_repetition())return 'Ничья: повторение позиции';
 if(game.insufficient_material())return 'Ничья: недостаточно фигур';
 if(game.in_draw())return 'Ничья';
 if(awaiting)return 'Разберите ход с тренером и нажмите «Продолжить»';
 return (game.turn()===human?'Ваш ход':'Ход соперника')+(game.in_check()?' · Шах':'');
}
function render(m=null){
 const board=$('board');board.textContent='';
 const possible=selected?game.moves({square:selected,verbose:true}):[];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const file=human==='w'?col:7-col,rank=human==='w'?8-row:row+1,sq='abcdefgh'[file]+rank,p=game.get(sq);
  const cell=document.createElement('button');cell.type='button';cell.dataset.square=sq;
  cell.className='square'+((file+rank)%2===1?' dark':'')+(selected===sq?' selected':'')+(last&&(last.from===sq||last.to===sq)?' last':'')+(p&&p.type==='k'&&p.color===game.turn()&&game.in_check()?' check':'');
  cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',sq+(p?' '+(p.color==='w'?'белые ':'чёрные ')+names[p.type]:''));
  if(possible.some(x=>x.to===sq)){const dot=document.createElement('span');dot.className=p?'capture':'dot';cell.appendChild(dot);}
  if(row===7){const c=document.createElement('span');c.className='coord';c.textContent='abcdefgh'[file];cell.appendChild(c);}
  if(col===0){const c=document.createElement('span');c.className='coord rank';c.textContent=rank;cell.appendChild(c);}
  board.appendChild(cell);
 }
 syncPieces(m);
 $('level').textContent='≈ '+elo+' Elo · Вы '+(human==='w'?'белыми':'чёрными');
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
 $('status').textContent=error||statusText();$('retry').hidden=!error;$('undo').disabled=game.history().length===0;
 $('modeInfo').textContent=mode==='game'?'':mode==='learn'?'С тренером':'Оценка каждого хода';
 renderHistory();renderCoach();renderBoardBadge();renderArrow();
}
function renderHistory(){
 const h=game.history(),rows=$('moveRows');rows.textContent='';$('emptyMoves').hidden=h.length>0;
 for(let i=0;i<h.length;i+=2){
  const tr=document.createElement('tr'),number=document.createElement('td');number.textContent=i/2+1;tr.appendChild(number);
  for(let j=i;j<i+2;j++){
   const td=document.createElement('td');
   if(j<h.length){
    const b=document.createElement('button');b.className='moveCell'+(coachIndex===j||(coachIndex===null&&j===h.length-1)?' active':'');b.type='button';
    const text=document.createElement('span');text.textContent=localSan(h[j]);b.appendChild(text);
    if(reviews[j]){b.appendChild(qualityIcon(reviews[j].quality));b.title=localSan(h[j])+' — '+qualities[reviews[j].quality].label;b.onclick=()=>{coachIndex=j;hintMove=null;render();};}
    else{b.disabled=true;if(mode!=='game'){const p=document.createElement('span');p.className='pending';p.textContent=pendingReview&&pendingReview.ply===j?'…':'·';b.appendChild(p);}}
    td.appendChild(b);
   }
   tr.appendChild(td);
  }
  rows.appendChild(tr);
 }
 if(h.length!==renderedHistoryCount){$('history').scrollTop=$('history').scrollHeight;renderedHistoryCount=h.length;}
}
function scoreText(cp){if(Math.abs(cp)>=90000)return cp>0?'+Мат':'−Мат';return (cp>0?'+':cp<0?'−':'')+(Math.abs(cp)/100).toFixed(2);}
function selectedReport(){
 if(coachIndex!==null&&reviews[coachIndex])return reviews[coachIndex];
 if(mode==='learn'){for(let i=reviews.length-1;i>=0;i--)if(reviews[i]&&reviews[i].side===human)return reviews[i];}
 for(let i=reviews.length-1;i>=0;i--)if(reviews[i])return reviews[i];
 return null;
}
function renderCoach(){
 const r=selectedReport();$('coach').hidden=mode==='game'||!r;
 if(!r)return;
 const q=qualities[r.quality];$('coachTitle').textContent=(r.side===human?'Ваш ход ':'Ход соперника ')+localSan(r.san);
 $('coachMark').textContent='';$('coachMark').append(qualityIcon(r.quality),document.createTextNode(q.label));
 $('coachText').textContent=r.text;
 $('coachScore').textContent='Оценка: '+scoreText(r.whiteBefore)+' → '+scoreText(r.whiteAfter)+' (за белых)'+(r.bestSan?'\nЛучший вариант: '+r.bestSan:'')+(r.replyLine?'\nОтвет соперника: '+r.replyLine:'');
 const current=r.ply===game.history().length-1;
 $('continue').hidden=!awaiting;
 $('continue').disabled=busy;
 $('tryAgain').hidden=mode!=='learn'||!current||r.side!==human;$('tryAgain').disabled=busy;
 $('hint').hidden=!current||!r.reply||game.game_over();$('hint').textContent=hintMove?'Скрыть ответ':'Показать ответ';
}
function renderBoardBadge(){
 const n=game.history().length,r=reviews[n-1],badge=$('moveBadge');badge.hidden=mode==='game'||!last||!r;
 if(badge.hidden)return;
 badge.textContent='';badge.appendChild(qualityIcon(r.quality));const c=coordinates(last.to);
 badge.style.left=(c.x+1)*12.5+'%';badge.style.top=c.y*12.5+'%';
}
function renderArrow(){
 const line=$('hintArrow');line.setAttribute('visibility',hintMove?'visible':'hidden');if(!hintMove)return;
 const a=coordinates(hintMove.slice(0,2)),b=coordinates(hintMove.slice(2,4));
 line.setAttribute('x1',a.x*100+50);line.setAttribute('y1',a.y*100+50);line.setAttribute('x2',b.x*100+50);line.setAttribute('y2',b.y*100+50);
}
function tap(sq){
 if(busy||awaiting||game.game_over()||game.turn()!==human)return;
 hintMove=null;const p=game.get(sq);
 if(p&&p.color===human){selected=selected===sq?null:sq;render();return;}
 if(!selected)return;
 const moves=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!moves.length){selected=null;render();return;}
 if(moves.some(m=>m.promotion)){
  const from=selected;$('promotionChoices').textContent='';
  for(const promotion of ['q','r','b','n']){
   const b=document.createElement('button'),img=document.createElement('img');img.src=pieceSrc({color:human,type:promotion});img.alt=names[promotion];b.appendChild(img);
   b.onclick=()=>{$('promotion').close();play({from,to:sq,promotion});};$('promotionChoices').appendChild(b);
  }
  $('promotion').showModal();
 }else play({from:selected,to:sq});
}
function applyMove(m){
 last=m;selected=null;hintMove=null;error='';coachIndex=null;awaiting=false;
 const n=game.history().length;reviews=reviews.slice(0,n-1);reviews[n-1]=null;persist();render(m);
 if(mode==='game')think();else startReview(contextForLast());
}
function play(move){if(busy||awaiting||game.turn()!==human||game.game_over())return;const m=game.move(move);if(m)applyMove(m);}
function think(){
 if(game.game_over()||game.turn()===human||busy||awaiting)return;
 busy=true;phase='opponent';error='';const id=++request;render();Native.search(id,moveList(),elo);
}
function onEngine(id,move,err){
 if(id!==request)return;busy=false;phase='';
 if(err){error=err;render();return;}
 let candidate={from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]||'q'};
 if(elo<1320&&Math.random()<Math.max(0,(1320-elo)/1600)){const legal=game.moves({verbose:true});candidate=legal[Math.floor(Math.random()*legal.length)];}
 const m=game.move(candidate);if(!m){error='Stockfish вернул недопустимый ход';render();return;}
 applyMove(m);
}
function startReview(ctx){
 if(!ctx)return;busy=true;phase='review';error='';pendingReview=ctx;const id=++request;render();
 Native.review(id,ctx.beforeMoves,ctx.move);
}
function probability(cp){return 1/(1+Math.exp(-Math.max(-4000,Math.min(4000,cp))/240));}
function classify(before,after,ctx){
 if(ctx.checkmate)return 'best';
 if(ctx.legal===1)return 'forced';
 if(before.best===ctx.move)return 'best';
 if(before.mate>0&&!(after.mate<0)&&!ctx.draw)return 'missed';
 const afterScore=ctx.draw?0:-after.cp,loss=Math.max(0,probability(before.cp)-probability(afterScore));
 return loss<=.015?'excellent':loss<=.04?'good':loss<=.10?'inaccuracy':loss<=.22?'mistake':'blunder';
}
function lineToSan(fen,pv,max=3){
 const temp=new Chess(fen),result=[];
 for(const move of (pv||'').split(' ').slice(0,max)){
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))break;
  const m=temp.move({from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]||'q'});if(!m)break;result.push(localSan(m.san));
 }
 return result.join(' → ');
}
function makeReport(ctx,data){
 const {before,after}=data,key=classify(before,after,ctx),sign=ctx.side==='w'?1:-1;
 const bestSan=lineToSan(ctx.beforeFen,before.best,1),replyLine=lineToSan(ctx.afterFen,after.pv||after.best,3);
 const whiteBefore=before.cp*sign,whiteAfter=(ctx.checkmate?100000:ctx.draw?0:-after.cp)*sign;
 let text='';
 if(ctx.checkmate)text='Вы поставили мат.';else if(key==='forced')text='В этой позиции был только один допустимый ход.';
 else if(key==='best')text='Вы выбрали лучший ход по текущему анализу Stockfish. Он лучше всего сохраняет возможности вашей позиции.';
 else if(key==='excellent')text='Сильный ход: оценка позиции почти не изменилась.';
 else if(key==='good')text='Хороший ход. Есть чуть более точное продолжение'+(bestSan?' — '+bestSan:'')+'.';
 else if(key==='missed')text='Был вариант с форсированным матом'+(bestSan?' после '+bestSan:'')+'. После сыгранного хода форсированный мат уже не найден.';
 else text=(key==='inaccuracy'?'Есть более точный ход.':key==='mistake'?'Этот ход заметно ухудшил вашу позицию.':'Этот ход серьёзно ухудшил вашу позицию.')+(bestSan?' Лучше было '+bestSan+'.':'')+(replyLine?' Соперник может ответить '+replyLine+'.':'');
 if(ctx.side!==human)text=text.replace('Вы поставили','Соперник поставил').replace('Вы выбрали','Соперник выбрал').replace(/вашей позиции/g,'позиции соперника').replace(/вашу позицию/g,'позицию соперника');
 return {ply:ctx.ply,side:ctx.side,uci:ctx.move,san:ctx.san,quality:key,text,whiteBefore,whiteAfter,best:before.best,bestSan,reply:after.best,replyLine,afterFen:ctx.afterFen,depthBefore:before.depth||0,depthAfter:after.depth||0};
}
function onReview(id,data,err){
 if(id!==request||!pendingReview)return;
 busy=false;phase='';
 if(err){error=err;render();return;}
 const ctx=pendingReview;
 if(ctx.ply!==game.history().length-1||ctx.afterFen!==game.fen())return;
 reviews[ctx.ply]=makeReport(ctx,data);pendingReview=null;
 awaiting=mode==='learn'&&ctx.side===human&&!game.game_over();
 persist();render();if(!awaiting)think();
}
function undo(){
 cancelWork();selected=null;coachIndex=null;
 if(!game.history().length)return;
 game.undo();if(game.turn()!==human&&game.history().length)game.undo();
 reviews=reviews.slice(0,game.history().length);last=game.history({verbose:true}).slice(-1)[0]||null;
 persist();resetPieces();render();think();
}
function setMode(value){
 if(!['game','learn','practice'].includes(value)||value===mode)return;
 cancelWork();mode=value;coachIndex=null;selected=null;persist();render();resume();
}
$('board').onclick=e=>{
 if(suppressClick){suppressClick=false;return;}
 const cell=e.target.closest('[data-square]');if(cell)tap(cell.dataset.square);
};
$('board').addEventListener('pointerdown',e=>{
 if(e.button!==0||busy||awaiting||game.game_over()||game.turn()!==human)return;
 const cell=e.target.closest('[data-square]');if(!cell)return;
 const from=cell.dataset.square,p=game.get(from);if(!p||p.color!==human)return;
 drag={id:e.pointerId,from,node:pieceNodes.get(from),x:e.clientX,y:e.clientY,active:false};
});
$('board').addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(!drag.active&&Math.hypot(dx,dy)<7)return;
 if(!drag.active){drag.active=true;$('board').setPointerCapture(e.pointerId);selected=drag.from;render();drag.node.classList.add('dragging');}
 const c=coordinates(drag.from);drag.node.style.transform='translate(calc('+c.x*100+'% + '+dx+'px),calc('+c.y*100+'% + '+dy+'px))';
});
function endDrag(e,cancelled=false){
 if(!drag||drag.id!==e.pointerId)return;
 const d=drag;drag=null;d.node.classList.remove('dragging');d.node.style.transform=transformFor(d.from);
 if(!d.active)return;
 suppressClick=true;setTimeout(()=>{suppressClick=false;},300);
 if(!cancelled){
  const rect=$('board').getBoundingClientRect(),x=Math.floor((e.clientX-rect.left)/rect.width*8),y=Math.floor((e.clientY-rect.top)/rect.height*8);
  if(x>=0&&x<8&&y>=0&&y<8){const sq='abcdefgh'[human==='w'?x:7-x]+(human==='w'?8-y:y+1);selected=d.from;if(sq!==d.from){tap(sq);return;}}
 }
 selected=null;render();
}
$('board').addEventListener('pointerup',e=>endDrag(e));
$('board').addEventListener('pointercancel',e=>endDrag(e,true));
$('undo').onclick=undo;
$('retry').onclick=()=>{if(pendingReview)startReview(pendingReview);else think();};
$('continue').onclick=()=>{awaiting=false;hintMove=null;persist();render();think();};
$('tryAgain').onclick=undo;
$('hint').onclick=()=>{const r=selectedReport();if(r&&r.afterFen===game.fen()){hintMove=hintMove?null:r.reply;render();}};
document.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>setMode(b.dataset.mode);});
$('new').onclick=()=>{$('rating').value=elo;$('ratingText').textContent='≈ '+elo+' Elo';$('color').value=human;$('newMode').value=mode;$('setup').showModal();};
$('rating').oninput=()=>{$('ratingText').textContent='≈ '+$('rating').value+' Elo';};
$('start').onclick=()=>{
 if(game.history().length)saveGame(false);
 const color=$('color').value;
 restore({moves:[],human:color==='random'?(Math.random()<.5?'w':'b'):color,elo:Number($('rating').value),mode:$('newMode').value});$('setup').close();
};
function saveGame(notify=true){
 const archive=read('archive',[]);savedId=savedId||String(Date.now());persist();
 const item={...state(),time:Date.now(),pgn:game.pgn()},pos=archive.findIndex(s=>s.id===savedId);
 if(pos<0)archive.unshift(item);else archive[pos]=item;
 Native.write('archive',JSON.stringify(archive));if(notify)toast('Партия сохранена');
}
$('save').onclick=()=>saveGame();
$('archive').onclick=()=>{
 const list=$('savedList');list.textContent='';
 const items=read('archive',[]).sort((a,b)=>b.time-a.time);
 if(!items.length)list.textContent='Пока нет сохранённых партий';
 for(const item of items){
  const b=document.createElement('button');b.className='savedItem';
  const title=document.createElement('div');title.textContent=new Date(item.time).toLocaleString('ru-RU');
  const sub=document.createElement('small');sub.textContent='≈ '+item.elo+' Elo · '+Math.ceil(item.moves.length/2)+' ходов · '+(item.human==='w'?'Белые':'Чёрные')+' · '+({game:'Игра',learn:'Обучение',practice:'Практика'}[item.mode||'game']);
  b.append(title,sub);b.onclick=()=>{if(game.history().length)saveGame(false);restore(item);$('saved').close();};list.appendChild(b);
 }
 $('saved').showModal();
};
$('export').onclick=()=>{game.header('Event','Офлайн-шахматы','White',human==='w'?'Игрок':'Stockfish','Black',human==='b'?'Игрок':'Stockfish','Date',new Date().toISOString().slice(0,10).replace(/-/g,'.'),'Result',game.in_checkmate()?(game.turn()==='w'?'0-1':'1-0'):game.in_draw()?'1/2-1/2':'*');Native.export(game.pgn());};
$('legend').onclick=()=>{
 $('legendList').textContent='';for(const [key,q]of Object.entries(qualities)){const row=document.createElement('div');row.className='legendItem';row.append(qualityIcon(key),document.createTextNode(q.label));$('legendList').appendChild(row);}
 $('legendDialog').showModal();
};
const initial=read('current',null);
try{if(initial)restore(initial);else{render();$('setup').showModal();}}catch(e){cancelWork();game=new Chess();reviews=[];resetPieces();render();toast('Не удалось восстановить партию');}

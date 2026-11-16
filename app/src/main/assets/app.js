'use strict';
const $=id=>document.getElementById(id);
const symbols={w:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}};
let game=new Chess(),human='w',elo=1200,selected=null,busy=false,request=0,last=null,error='',savedId=null;
function read(key,fallback){try{return JSON.parse(Native.read(key))||fallback;}catch(e){return fallback;}}
function state(){return {moves:game.history(),human,elo,id:savedId};}
function persist(){Native.write('current',JSON.stringify(state()));}
function restore(s){Native.cancel();++request;busy=false;selected=null;error='';game=new Chess();human=s.human==='b'?'b':'w';elo=Number(s.elo)||1200;savedId=s.id||null;for(const m of s.moves||[]){if(!game.move(m))throw Error('Повреждена партия');}last=game.history({verbose:true}).slice(-1)[0]||null;render();persist();think();}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2300);}
function render(){
 const board=$('board');board.textContent='';
 const possible=selected?game.moves({square:selected,verbose:true}):[];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const file=human==='w'?col:7-col,rank=human==='w'?8-row:row+1,sq='abcdefgh'[file]+rank,p=game.get(sq);
  const cell=document.createElement('button');cell.type='button';cell.className='square'+((file+rank)%2===0?' dark':'')+(selected===sq?' selected':'')+(last&&(last.from===sq||last.to===sq)?' last':'');
  cell.setAttribute('role','gridcell');cell.setAttribute('aria-label',sq+(p?' '+(p.color==='w'?'белые ':'чёрные ')+({p:'пешка',n:'конь',b:'слон',r:'ладья',q:'ферзь',k:'король'}[p.type]):''));
  if(p){const piece=document.createElement('span');piece.className='piece '+(p.color==='w'?'white':'black');piece.textContent=symbols[p.color][p.type];cell.appendChild(piece);}
  if(possible.some(m=>m.to===sq)){const dot=document.createElement('span');dot.className=p?'capture':'dot';cell.appendChild(dot);}
  if(row===7){const c=document.createElement('span');c.className='coord';c.textContent='abcdefgh'[file];cell.appendChild(c);}
  if(col===0){const c=document.createElement('span');c.className='coord rank';c.textContent=rank;cell.appendChild(c);}
  cell.onclick=()=>tap(sq);board.appendChild(cell);
 }
 $('level').textContent='≈ '+elo+' Elo · Вы играете '+(human==='w'?'белыми':'чёрными');
 let status=busy?'Stockfish думает…':(game.turn()===human?'Ваш ход':'Ход соперника');
 if(game.in_checkmate())status=game.turn()===human?'Мат. Победил Stockfish':'Мат. Вы победили!';
 else if(game.in_stalemate())status='Пат — ничья';
 else if(game.in_threefold_repetition())status='Ничья: повторение позиции';
 else if(game.insufficient_material())status='Ничья: недостаточно фигур';
 else if(game.in_draw())status='Ничья';
 else if(game.in_check())status+=' · Шах';
 $('status').textContent=error||status;$('retry').hidden=!error;
 $('undo').disabled=game.history().length===0;
 const h=game.history();$('history').textContent=h.length?h.map((m,i)=>(i%2===0?((i/2+1)+'. '):'')+m).join(' '):'Нажмите на фигуру, затем на клетку хода';
 $('history').scrollTop=$('history').scrollHeight;
}
function tap(sq){
 if(busy||game.game_over()||game.turn()!==human)return;
 const p=game.get(sq);
 if(p&&p.color===human){selected=selected===sq?null:sq;render();return;}
 if(!selected)return;
 const moves=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!moves.length){selected=null;render();return;}
 if(moves.some(m=>m.promotion)){
  const from=selected;$('promotionChoices').textContent='';
  for(const promotion of ['q','r','b','n']){const b=document.createElement('button');b.textContent=symbols[human][promotion];b.style.fontSize='32px';b.onclick=()=>{$('promotion').close();play({from,to:sq,promotion});};$('promotionChoices').appendChild(b);}
  $('promotion').showModal();
 }else play({from:selected,to:sq});
}
function play(move){const m=game.move(move);if(!m)return;last=m;selected=null;error='';persist();render();think();}
function think(){
 if(game.game_over()||game.turn()===human||busy)return;
 busy=true;error='';const id=++request;render();
 const moves=game.history({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')).join(' ');
 Native.search(id,moves,elo);
}
function onEngine(id,uci,err){
 if(id!==request)return;
 busy=false;
 if(err){error=err;render();return;}
 let move={from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'};
 if(elo<1320&&Math.random()<Math.max(0,(1320-elo)/1600)){
  const legal=game.moves({verbose:true});move=legal[Math.floor(Math.random()*legal.length)];
 }
 const m=game.move(move);
 if(!m){error='Stockfish вернул недопустимый ход';render();return;}
 last=m;persist();render();
}
function undo(){Native.cancel();++request;busy=false;error='';selected=null;
 if(!game.history().length)return;
 game.undo();if(game.turn()!==human&&game.history().length)game.undo();
 last=game.history({verbose:true}).slice(-1)[0]||null;persist();render();think();
}
$('undo').onclick=undo;
$('retry').onclick=think;
$('new').onclick=()=>{$('rating').value=elo;$('ratingText').textContent='≈ '+elo+' Elo';$('color').value=human;$('setup').showModal();};
$('rating').oninput=()=>{$('ratingText').textContent='≈ '+$('rating').value+' Elo';};
$('start').onclick=()=>{
 if(game.history().length)saveGame(false);
 const color=$('color').value;
 restore({moves:[],human:color==='random'?(Math.random()<.5?'w':'b'):color,elo:Number($('rating').value)});
 $('setup').close();
};
function saveGame(notify=true){
 const archive=read('archive',[]);savedId=savedId||String(Date.now());persist();
 const item={...state(),time:Date.now(),pgn:game.pgn()};
 const pos=archive.findIndex(s=>s.id===savedId);
 if(pos<0)archive.unshift(item);else archive[pos]=item;
 Native.write('archive',JSON.stringify(archive));
 if(notify)toast('Партия сохранена');
}
$('save').onclick=()=>saveGame();
$('archive').onclick=()=>{
 const list=$('savedList');list.textContent='';
 const items=read('archive',[]).sort((a,b)=>b.time-a.time);
 if(!items.length)list.textContent='Пока нет сохранённых партий';
 for(const item of items){
  const b=document.createElement('button');b.className='savedItem';
  const title=document.createElement('div');title.textContent=new Date(item.time).toLocaleString('ru-RU');
  const sub=document.createElement('small');sub.textContent='≈ '+item.elo+' Elo · '+Math.ceil(item.moves.length/2)+' ходов · '+(item.human==='w'?'Белые':'Чёрные');
  b.append(title,sub);b.onclick=()=>{if(game.history().length)saveGame(false);restore(item);$('saved').close();};list.appendChild(b);
 }
 $('saved').showModal();
};
$('export').onclick=()=>{game.header('Event','Офлайн-шахматы','White',human==='w'?'Игрок':'Stockfish','Black',human==='b'?'Игрок':'Stockfish','Date',new Date().toISOString().slice(0,10).replace(/-/g,'.'),'Result',game.in_checkmate()?(game.turn()==='w'?'0-1':'1-0'):game.in_draw()?'1/2-1/2':'*');Native.export(game.pgn());};
const initial=read('current',null);
try{if(initial)restore(initial);else{render();$('setup').showModal();}}catch(e){game=new Chess();render();toast('Не удалось восстановить партию');}

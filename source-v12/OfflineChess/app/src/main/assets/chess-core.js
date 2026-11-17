/* OfflineChess rules engine. Independent implementation of classic chess rules. */
(function(root){
'use strict';
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const COLS='abcdefgh';
const VAL={p:100,n:320,b:335,r:500,q:900,k:0};
const idx=(r,c)=>r*8+c, row=s=>s>>3, col=s=>s&7;
const inBoard=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const color=p=>!p?null:(p===p.toUpperCase()?'w':'b');
const type=p=>p.toLowerCase();
const square=s=>COLS[col(s)]+(8-row(s));
const index=s=>s&&/^[a-h][1-8]$/.test(s)?idx(8-Number(s[1]),COLS.indexOf(s[0])):-1;
const other=t=>t==='w'?'b':'w';
const clone=b=>b.slice();
class ChessGame {
 constructor(fen){ this.history=[]; this.load(fen||START); }
 load(fen){
  const a=fen.trim().split(/\s+/); if(a.length<4)throw Error('Неправильный FEN');
  const parts=a[0].split('/'); if(parts.length!==8)throw Error('Неправильный FEN');
  this.board=Array(64).fill(null);
  for(let r=0;r<8;r++){let c=0;for(const ch of parts[r]){if(/^[1-8]$/.test(ch))c+=+ch; else{if(!/^[pnbrqkPNBRQK]$/.test(ch)||c>=8)throw Error('Неправильный FEN');this.board[idx(r,c++)]=ch;}}if(c!==8)throw Error('Неправильный FEN');}
  this.turn=a[1];this.castle=a[2]==='-'?'':a[2];this.ep=a[3]==='-'?-1:index(a[3]);this.half=+(a[4]||0);this.full=+(a[5]||1);this.history=[];
  if(!['w','b'].includes(this.turn))throw Error('Неправильный FEN');return this;
 }
 fen(){let v=[];for(let r=0;r<8;r++){let z='',n=0;for(let c=0;c<8;c++){const p=this.board[idx(r,c)];if(p){if(n)z+=n;n=0;z+=p;}else n++;}if(n)z+=n;v.push(z);}return `${v.join('/')} ${this.turn} ${this.castle||'-'} ${this.ep<0?'-':square(this.ep)} ${this.half} ${this.full}`;}
 snapshot(){return {board:clone(this.board),turn:this.turn,castle:this.castle,ep:this.ep,half:this.half,full:this.full};}
 restore(s){this.board=clone(s.board);this.turn=s.turn;this.castle=s.castle;this.ep=s.ep;this.half=s.half;this.full=s.full;}
 copy(){let x=new ChessGame(this.fen());return x;}
 kingSquare(c){return this.board.indexOf(c==='w'?'K':'k');}
 attacked(s,by){
  if(s<0)return false;
  const r=row(s),c=col(s),b=this.board;
  const pr=by==='w'?r+1:r-1;
  for(let dc of [-1,1])if(inBoard(pr,c+dc)&&b[idx(pr,c+dc)]===(by==='w'?'P':'p'))return true;
  for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){let rr=r+dr,cc=c+dc;if(inBoard(rr,cc)&&b[idx(rr,cc)]===(by==='w'?'N':'n'))return true;}
  for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]){
   let rr=r+dr,cc=c+dc,d=1;
   while(inBoard(rr,cc)){const p=b[idx(rr,cc)];if(p){if(color(p)===by){const t=type(p);if((d===1&&t==='k')||((dr===0||dc===0)&&(t==='r'||t==='q'))||((dr!==0&&dc!==0)&&(t==='b'||t==='q')))return true;}break;}rr+=dr;cc+=dc;d++;}
  }return false;
 }
 check(c=this.turn){return this.attacked(this.kingSquare(c),other(c));}
 pseudo(){
  const result=[],b=this.board,side=this.turn;
  const push=(f,t,extra={})=>{if(b[t]&&type(b[t])==='k')return;if((type(b[f])==='p')&&(row(t)===0||row(t)===7)){for(const prom of ['q','r','b','n'])result.push({from:f,to:t,promotion:prom,...extra});}else result.push({from:f,to:t,...extra});};
  for(let s=0;s<64;s++){
   const p=b[s];if(!p||color(p)!==side)continue;
   const t=type(p),r=row(s),c=col(s);
   if(t==='p'){
    const d=side==='w'?-1:1,initial=side==='w'?6:1,rr=r+d;
    if(inBoard(rr,c)&&!b[idx(rr,c)]){push(s,idx(rr,c));if(r===initial&&!b[idx(r+2*d,c)])push(s,idx(r+2*d,c));}
    for(const dc of [-1,1])if(inBoard(rr,c+dc)){const dest=idx(rr,c+dc);if(b[dest]&&color(b[dest])!==side)push(s,dest);else if(dest===this.ep)push(s,dest,{enpassant:true});}
   } else if(t==='n'){
    for(const [dr,dc]of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])if(inBoard(r+dr,c+dc)){const dest=idx(r+dr,c+dc);if(!b[dest]||color(b[dest])!==side)push(s,dest);}
   } else {
    const dirs=t==='b'?[[-1,-1],[-1,1],[1,-1],[1,1]]:t==='r'?[[-1,0],[1,0],[0,-1],[0,1]]:[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc;while(inBoard(rr,cc)){let dest=idx(rr,cc);if(!b[dest])push(s,dest);else {if(color(b[dest])!==side)push(s,dest);break;}if(t==='k')break;rr+=dr;cc+=dc;}}
    if(t==='k'&&!this.check(side)){
     const home=side==='w'?7:0,king=idx(home,4),enemy=other(side);
     if(s===king){
      const key=side==='w'?'K':'k';if(this.castle.includes(key)&&b[idx(home,7)]===(side==='w'?'R':'r')&&!b[idx(home,5)]&&!b[idx(home,6)]&&!this.attacked(idx(home,5),enemy)&&!this.attacked(idx(home,6),enemy))push(s,idx(home,6),{castle:'k'});
      const qkey=side==='w'?'Q':'q';if(this.castle.includes(qkey)&&b[idx(home,0)]===(side==='w'?'R':'r')&&!b[idx(home,1)]&&!b[idx(home,2)]&&!b[idx(home,3)]&&!this.attacked(idx(home,3),enemy)&&!this.attacked(idx(home,2),enemy))push(s,idx(home,2),{castle:'q'});
     }
    }
   }
  }return result;
 }
 _apply(m){
  const b=this.board,p=b[m.from],t=type(p),us=this.turn,got=b[m.to],fr=row(m.from),tr=row(m.to),fc=col(m.from),tc=col(m.to);
  const capture=!!got||!!m.enpassant;
  b[m.from]=null;b[m.to]=m.promotion?(us==='w'?m.promotion.toUpperCase():m.promotion):p;
  if(m.enpassant)b[idx(fr,tc)]=null;
  if(t==='k'&&Math.abs(tc-fc)===2){const home=us==='w'?7:0,fromR=tc===6?idx(home,7):idx(home,0),toR=tc===6?idx(home,5):idx(home,3);b[toR]=b[fromR];b[fromR]=null;}
  if(t==='k')this.castle=this.castle.replace(us==='w'?/[KQ]/g:/[kq]/g,'');
  if(m.from===63||m.to===63)this.castle=this.castle.replace('K','');
  if(m.from===56||m.to===56)this.castle=this.castle.replace('Q','');
  if(m.from===7||m.to===7)this.castle=this.castle.replace('k','');
  if(m.from===0||m.to===0)this.castle=this.castle.replace('q','');
  this.ep=t==='p'&&Math.abs(tr-fr)===2?idx((fr+tr)/2,fc):-1;
  this.half=(t==='p'||capture)?0:this.half+1;
  if(us==='b')this.full++;
  this.turn=other(us);
 }
 legalMoves(){const prev=this.snapshot(),list=[];for(const m of this.pseudo()){this._apply(m);if(!this.check(prev.turn))list.push(m);this.restore(prev);}return list;}
 sanFor(m,legal){const p=this.board[m.from],t=type(p),got=!!this.board[m.to]||m.enpassant;let san='';
  if(t==='k'&&Math.abs(col(m.to)-col(m.from))===2)san=col(m.to)===6?'O-O':'O-O-O';
  else{
   san=t==='p'?'':t.toUpperCase();
   if(t!=='p'){const also=legal.filter(v=>v!==m&&v.to===m.to&&v.from!==m.from&&type(this.board[v.from])===t);if(also.length){const sameFile=also.some(v=>col(v.from)===col(m.from)),sameRank=also.some(v=>row(v.from)===row(m.from));if(!sameFile)san+=COLS[col(m.from)];else if(!sameRank)san+=8-row(m.from);else san+=square(m.from);}}
   if(t==='p'&&got)san+=COLS[col(m.from)];
   if(got)san+='x';san+=square(m.to);if(m.promotion)san+='='+m.promotion.toUpperCase();
  }
  let snap=this.snapshot();this._apply(m);if(this.check())san+=this.legalMoves().length===0?'#':'+';this.restore(snap);return san;
 }
 move(from,to,promotion='q'){
  if(typeof from==='string')from=index(from);if(typeof to==='string')to=index(to);
  const legal=this.legalMoves();const m=legal.find(x=>x.from===from&&x.to===to&&(!x.promotion||x.promotion===promotion));if(!m)return null;
  const san=this.sanFor(m,legal),before=this.snapshot();this._apply(m);
  const played={from:before.board[m.from]===before.board[m.from].toUpperCase()?'w':'b',...m,san,fromSquare:square(m.from),toSquare:square(m.to),fen:this.fen(),before,annotation:null};
  this.history.push(played);return played;
 }
 undo(){const h=this.history.pop();if(h){this.restore(h.before);return h;}return null;}
 outcome(){const moves=this.legalMoves();if(!moves.length)return this.check()?{kind:'mate',winner:other(this.turn)}:{kind:'draw',reason:'Пат'};
  if(this.half>=100)return {kind:'draw',reason:'Правило 50 ходов'};
  const material=this.board.filter(Boolean).filter(p=>!['k'].includes(type(p)));
  if(material.length===0||material.length===1&&['n','b'].includes(type(material[0])))return {kind:'draw',reason:'Недостаточно материала'};
  const key=()=>this.fen().split(' ').slice(0,4).join(' ');
  let times=1,current=key();for(const h of this.history)if(h.before){const temp=this.snapshot();this.restore(h.before);if(key()===current)times++;this.restore(temp);}if(times>=3)return {kind:'draw',reason:'Троекратное повторение'};
  return null;
 }
 pgn(){let out='';for(let i=0;i<this.history.length;i++){const m=this.history[i];if(i%2===0)out+=`${Math.floor(i/2)+1}. `;out+=m.san+(i%2?' ':' ');}const o=this.outcome();return out.trim()+(o?' '+(o.kind==='draw'?'1/2-1/2':o.winner==='w'?'1-0':'0-1'):' *');}
 exportData(){return {moves:this.history.map(h=>({from:h.fromSquare,to:h.toSquare,promotion:h.promotion,annotation:h.annotation||null})),fen:START};}
 importData(data){this.load(data.fen||START);for(const m of data.moves||[]){const played=this.move(m.from,m.to,m.promotion);if(!played)throw Error('Повреждённая партия');played.annotation=m.annotation||null;}return this;}
}
const evalBoard=(g)=>{
 let points=0;for(let i=0;i<64;i++){const p=g.board[i];if(!p)continue;const t=type(p),sg=color(p)==='w'?1:-1,r=color(p)==='w'?7-row(i):row(i),c=col(i),center=3.5-Math.abs(3.5-c),advance=r;
  let bonus=0;if(t==='p')bonus=advance*8+center*3;if(t==='n'||t==='b')bonus=center*12+(3.5-Math.abs(3.5-row(i)))*11;if(t==='q')bonus=center*3;if(t==='k'&&g.full<18)bonus=-Math.abs(c-4)*2;
  points+=sg*(VAL[t]+bonus);
 }
 return Math.round(points);
};
function search(g,depth,alpha=-100000,beta=100000){
 const o=g.outcome();if(o){if(o.kind==='mate')return -20000-depth;return 0;}
 if(depth<=0)return evalBoard(g)*(g.turn==='w'?1:-1);
 let moves=g.legalMoves();moves.sort((a,b)=>{const x=g.board[a.to],y=g.board[b.to];return (y?VAL[type(y)]:0)-(x?VAL[type(x)]:0);});
 let best=-999999;const snap=g.snapshot();
 for(const m of moves){g._apply(m);let s=-search(g,depth-1,-beta,-alpha);g.restore(snap);if(s>best)best=s;if(best>alpha)alpha=best;if(alpha>=beta)break;}
 return best;
}
function engineMove(g,elo){const moves=g.legalMoves(),snap=g.snapshot();if(!moves.length)return null;
 const depth=elo<900?1:elo<1700?2:3,noise=Math.max(0,(2600-elo)/5);
 const shuffled=moves.map(m=>{g._apply(m);let s=-search(g,depth-1);g.restore(snap);return {m,score:s,jitter:(Math.random()-.5)*noise*2};}).sort((a,b)=>(b.score+b.jitter)-(a.score+a.jitter));
 return {move:shuffled[0].m,score:shuffled[0].score,top:shuffled.slice(0,3)};
}
function analyzeMove(gBefore,m,depth=2){const g=gBefore.copy(),all=g.legalMoves(),start=g.turn;let best=-Infinity,bestMove=null,played=null,snap=g.snapshot();
 for(const move of all){g._apply(move);let score=-search(g,depth-1);g.restore(snap);if(score>best){best=score;bestMove=move;}if(move.from===m.from&&move.to===m.to&&move.promotion===m.promotion)played=score;}
 if(played===null){const x=all.find(v=>v.from===m.from&&v.to===m.to);if(x){g._apply(x);played=-search(g,depth-1);g.restore(snap);}}
 const loss=Math.max(0,Math.round(best-(played??best)));
 let kind=loss<17?'best':loss<65?'excellent':loss<130?'good':loss<230?'inaccuracy':loss<430?'mistake':'blunder';
 if(bestMove&&bestMove.from===m.from&&bestMove.to===m.to&&(!m.promotion||bestMove.promotion===m.promotion))kind='best';
 return {kind,loss,best:bestMove?{from:square(bestMove.from),to:square(bestMove.to)}:null,bestScore:best,playedScore:played,side:start};
}
root.OfflineChessCore={ChessGame,START,square,index,color,type,other,evalBoard,engineMove,analyzeMove,search};
if(typeof module!=='undefined'&&module.exports)module.exports=root.OfflineChessCore;
})(typeof window!=='undefined'?window:globalThis);

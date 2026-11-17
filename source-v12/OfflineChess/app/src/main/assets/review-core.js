/* Offline game review: transparent approximate accuracy model; not Chess.com proprietary scoring. */
(function(root){
'use strict';
const Core=root.OfflineChessCore||(typeof require==='function'?require('./chess-core.js'):null);
const {ChessGame,START,evalBoard,square,index,type,color}=Core;
const Insights=root.OfflineChessInsights||(typeof require==='function'?require('./insights-core.js'):null);
const VALUES={p:100,n:320,b:335,r:500,q:900,k:0};
const KINDS=['brilliant','best','excellent','good','inaccuracy','mistake','blunder'];
const LABELS={brilliant:'Блестящий ход',best:'Лучший ход',excellent:'Отличный ход',good:'Хороший ход',inaccuracy:'Неточность',mistake:'Ошибка',blunder:'Грубая ошибка'};
const MARKS={brilliant:'!!',best:'★',excellent:'!',good:'✓',inaccuracy:'?!',mistake:'?',blunder:'??'};
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function uciOf(move){return move?move.fromSquare+move.toSquare+(move.promotion||''):'';}
function chance(cp){return 50+50*Math.tanh(clamp(Number(cp)||0,-2000,2000)/500);}
function moveAccuracy(beforeCp,afterCp,side){
 const sign=side==='w'?1:-1;
 const lost=Math.max(0,chance(beforeCp*sign)-chance(afterCp*sign));
 return Math.round(clamp(100*Math.exp(-.065*lost),0,100)*10)/10;
}
function scoreLabel(cp){if(Math.abs(cp)>=9000)return (cp>0?'М+':'М−')+(10000-Math.abs(cp));return (cp>=0?'+':'')+(cp/100).toFixed(2);}
function isBrilliantSacrifice(before,move,after,afterAnalysis,best,loss){
 if(loss>20||uciOf(move)!==best||!move||!afterAnalysis?.lines?.length)return false;
 const moved=before.board[move.from],victim=before.board[move.to];
 if(!moved||VALUES[type(moved)]<300||victim&&VALUES[type(victim)]>=VALUES[type(moved)]-100)return false;
 if(Math.abs((before.turn==='w'?1:-1)*Number(afterAnalysis.score))>500)return false;
 const captures=after.legalMoves().some(m=>m.to===move.to && (after.board[m.to]||m.enpassant));
 if(!captures)return false;
 const next=afterAnalysis.lines[0].uci;
 if(!next||index(next.slice(2,4))!==move.to)return false;
 return true;
}
function annotationText(a){
 const message={brilliant:'Сильная жертва материала с компенсацией по анализу движка.',best:'Сильнейшее продолжение по текущему анализу.',excellent:'Очень близко к лучшему продолжению.',good:'Надёжный ход, но был более точный вариант.',inaccuracy:'Ход немного ухудшил положение.',mistake:'Этот ход заметно ухудшил позицию.',blunder:'Ход привёл к серьёзной потере преимущества.'}[a.kind];
 const loss=a.loss>=30?` Примерная потеря: ${(a.loss/100).toFixed(2)} пешки.`:'';
 const best=a.best&&a.best!==a.played?` Лучше: ${a.best.slice(0,2)} → ${a.best.slice(2,4)}.`:'';
 return message+loss+best;
}
function buildReview(moves,positions,engine='approx',quality='fast'){
 if(!Array.isArray(moves)||!Array.isArray(positions)||positions.length!==moves.length+1)throw Error('Недостаточно данных анализа');
 const entries=[];
 const totals={w:{counts:{},accuracies:[]},b:{counts:{},accuracies:[]}};
 const g=new ChessGame(START);
 for(let i=0;i<moves.length;i++){
  const origin=g.turn,pre=positions[i],post=positions[i+1],m=moves[i];
  if(!Number.isFinite(pre.score)||!Number.isFinite(post.score))throw Error('Некорректная оценка позиции');
  const before=Number(pre.score),after=Number(post.score),sign=origin==='w'?1:-1;
  const best=pre.lines?.[0]?.uci||null,played=uciOf(m);
  const loss=clamp(Math.round((before-after)*sign),0,20000);
  const accuracy=moveAccuracy(before,after,origin);
  let kind=best===played?'best':loss<=25?'excellent':loss<=75?'good':loss<=160?'inaccuracy':loss<=350?'mistake':'blunder';
  const prev=g.copy();
  const applied=g.move(m.fromSquare,m.toSquare,m.promotion);
  if(!applied)throw Error('Неверные ходы в партии');
  if(kind==='best'&&isBrilliantSacrifice(prev,m,g,post,best,loss))kind='brilliant';
  const entry={ply:i+1,side:origin,san:m.san,played,kind,loss,accuracy,best,eval:after,beforeEval:before,alternatives:pre.lines||[],comment:'',engine};
  entry.motifs=Insights.detectMotifs(prev,m,g);
  entry.comment=Insights.describeMove(entry,prev,g)||annotationText(entry);entries.push(entry);
  totals[origin].counts[kind]=(totals[origin].counts[kind]||0)+1;
  totals[origin].accuracies.push(accuracy);
 }
 for(const side of ['w','b']){
  const a=totals[side].accuracies;
  totals[side].accuracy=a.length?Math.round(a.reduce((s,n)=>s+n,0)/a.length*10)/10:null;
  totals[side].moves=a.length;
  totals[side].estimatedElo=Insights.estimateRating(totals[side].accuracy,totals[side].moves,totals[side].counts);
  delete totals[side].accuracies;
  for(const k of KINDS)totals[side].counts[k]=totals[side].counts[k]||0;
 }
 return {version:3,engine,quality,created:Date.now(),opening:Insights.lookupOpening(moves),positions:positions.map(x=>({score:x.score,lines:(x.lines||[]).slice(0,3)})),entries,totals};
}
// Fast local fallback for reports when the native engine binary has not been included.
// Only one-ply static estimates: explicitly labelled approximate in the UI.
function fallbackPosition(fen){
 const g=new ChessGame(fen),moves=g.legalMoves(),turn=g.turn,sg=turn==='w'?1:-1;
 const outcome=g.outcome();
 if(outcome)return {score:outcome.kind==='mate'?(turn==='w'?-9999:9999):0,lines:[]};
 const snap=g.snapshot();const lines=[];
 for(const m of moves){
  g._apply(m);
  let score=evalBoard(g);
  if(g.check()&&!g.legalMoves().length)score=sg*9999;
  g.restore(snap);
  lines.push({uci:square(m.from)+square(m.to)+(m.promotion||''),score,pv:[square(m.from)+square(m.to)+(m.promotion||'')]});
 }
 lines.sort((a,b)=>sg*(b.score-a.score));
 const top=lines.slice(0,3);
 return {score:top[0]?.score??evalBoard(g),lines:top};
}
function movesToFens(moves){const g=new ChessGame();const fens=[g.fen()];for(const m of moves){if(!g.move(m.fromSquare,m.toSquare,m.promotion))throw Error('Неверная партия');fens.push(g.fen());}return fens;}
function variationSan(fen,pv,limit=6){if(!Array.isArray(pv))return '';const g=new ChessGame(fen);let result=[];for(const u of pv.slice(0,limit)){if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u))break;const m=g.move(u.slice(0,2),u.slice(2,4),u[4]||'q');if(!m)break;result.push(m.san);}return result.join(' ');}
const api={buildReview,fallbackPosition,movesToFens,variationSan,moveAccuracy,scoreLabel,KINDS,LABELS,MARKS,chance};
root.OfflineChessReview=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

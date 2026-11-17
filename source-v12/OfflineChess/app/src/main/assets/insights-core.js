(function(root){'use strict';
const Core=root.OfflineChessCore||(typeof require==='function'?require('./chess-core.js'):null);
const {ChessGame,color,type,other,index,square}=Core;
const VAL={p:100,n:320,b:335,r:500,q:900,k:10000};
const RAW=[
['C20','Открытая игра','e2e4 e7e5'],['C50','Итальянская партия','e2e4 e7e5 g1f3 b8c6 f1c4'],
['C54','Итальянская: защита двух коней','e2e4 e7e5 g1f3 b8c6 f1c4 g8f6'],
['C53','Итальянская: ход ...Bc5','e2e4 e7e5 g1f3 b8c6 f1c4 f8c5'],
['C60','Испанская партия','e2e4 e7e5 g1f3 b8c6 f1b5'],
['C65','Испанская: берлинская защита','e2e4 e7e5 g1f3 b8c6 f1b5 g8f6'],
['C70','Испанская: защита Морфи','e2e4 e7e5 g1f3 b8c6 f1b5 a7a6'],
['C44','Шотландская партия','e2e4 e7e5 g1f3 b8c6 d2d4'],
['C47','Дебют четырёх коней','e2e4 e7e5 g1f3 b8c6 b1c3 g8f6'],
['C42','Русская партия','e2e4 e7e5 g1f3 g8f6'],
['C25','Венская партия','e2e4 e7e5 b1c3'],['C30','Королевский гамбит','e2e4 e7e5 f2f4'],
['C23','Дебют слона','e2e4 e7e5 f1c4'],['C44','Дебют Понциани','e2e4 e7e5 g1f3 b8c6 c2c3'],
['B20','Сицилианская защита','e2e4 c7c5'],['B22','Сицилианская: Алапин','e2e4 c7c5 c2c3'],
['B23','Сицилианская: закрытая','e2e4 c7c5 b1c3'],
['B90','Сицилианская: Найдорф','e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6'],
['B70','Сицилианская: дракон','e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6'],
['C00','Французская защита','e2e4 e7e6'],
['C02','Французская: вариант продвижения','e2e4 e7e6 d2d4 d7d5 e4e5'],
['C01','Французская: разменный вариант','e2e4 e7e6 d2d4 d7d5 e4d5 e6d5'],
['B10','Защита Каро — Канн','e2e4 c7c6'],
['B12','Каро — Канн: продвижение','e2e4 c7c6 d2d4 d7d5 e4e5'],
['B13','Каро — Канн: размен','e2e4 c7c6 d2d4 d7d5 e4d5 c6d5'],
['B01','Скандинавская защита','e2e4 d7d5'],['B02','Защита Алехина','e2e4 g8f6'],
['B07','Защита Пирца — Уфимцева','e2e4 d7d6'],['B06','Современная защита','e2e4 g7g6'],
['D00','Ферзевый дебют','d2d4 d7d5'],['D06','Ферзевый гамбит','d2d4 d7d5 c2c4'],
['D20','Принятый ферзевый гамбит','d2d4 d7d5 c2c4 d5c4'],
['D30','Отказанный ферзевый гамбит','d2d4 d7d5 c2c4 e7e6'],
['D10','Славянская защита','d2d4 d7d5 c2c4 c7c6'],
['D43','Полуславянская защита','d2d4 d7d5 c2c4 c7c6 b1c3 g8f6 g1f3 e7e6'],
['D02','Лондонская система','d2d4 d7d5 c1f4'],
['D04','Система Колле','d2d4 d7d5 g1f3 g8f6 e2e3'],
['E01','Каталонское начало','d2d4 g8f6 c2c4 e7e6 g2g3 d7d5 f1g2'],
['A45','Индийская защита','d2d4 g8f6'],
['E60','Староиндийская защита','d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6'],
['D80','Защита Грюнфельда','d2d4 g8f6 c2c4 g7g6 b1c3 d7d5'],
['E20','Защита Нимцовича','d2d4 g8f6 c2c4 e7e6 b1c3 f8b4'],
['E12','Новоиндийская защита','d2d4 g8f6 c2c4 e7e6 g1f3 b7b6'],
['A56','Защита Бенони','d2d4 g8f6 c2c4 c7c5 d4d5'],
['A80','Голландская защита','d2d4 f7f5'],
['A10','Английское начало','c2c4'],['A30','Английское: симметричное','c2c4 c7c5'],
['A04','Дебют Рети','g1f3'],['A02','Дебют Берда','f2f4'],
['A07','Староиндийская атака','g1f3 d7d5 g2g3'],
['A40','Нестандартный ферзевый дебют','d2d4'],['B00','Дебют королевской пешки','e2e4']
];
const OPENINGS=RAW.map(([eco,name,line])=>({eco,name,line:line.split(' ')}));
const toUci=x=>typeof x==='string'?x:x.fromSquare+x.toSquare+(x.promotion||'');
const prefix=(a,b)=>a.length<=b.length&&a.every((x,i)=>x===b[i]);
function lookupOpening(history){let seq=(history||[]).map(toUci),best=null;for(const o of OPENINGS)if(prefix(o.line,seq)&&(!best||o.line.length>best.line.length))best=o;return best?{eco:best.eco,name:best.name,bookPly:best.line.length}:null;}
function openingContinuations(history){let seq=(history||[]).map(toUci),out=new Map();for(const o of OPENINGS){if(prefix(seq,o.line)&&seq.length<o.line.length){const m=o.line[seq.length];if(!out.has(m))out.set(m,[]);out.get(m).push(o.name);}}return [...out].map(([uci,names])=>({uci,names:[...new Set(names)]}));}
function openingSearch(q){q=String(q||'').toLowerCase().trim();return OPENINGS.filter(o=>o.name.toLowerCase().includes(q)||o.eco.toLowerCase().includes(q)).sort((a,b)=>a.eco.localeCompare(b.eco));}
function attacksFrom(g,s){const p=g.board[s];if(!p)return [];const r=s>>3,c=s&7,t=type(p),out=[];
 const put=(rr,cc)=>{if(rr>=0&&rr<8&&cc>=0&&cc<8){out.push(rr*8+cc);return true;}return false;};
 if(t==='p'){const rr=r+(color(p)==='w'?-1:1);put(rr,c-1);put(rr,c+1);}
 else if(t==='n'||t==='k'){for(const [dr,dc] of (t==='n'?[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]))put(r+dr,c+dc);}
 else for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[0,-1],[0,1],[-1,0],[1,0]]){if(t==='r'&&dr&&dc||t==='b'&&(!dr||!dc))continue;let rr=r+dr,cc=c+dc;while(put(rr,cc)){if(g.board[rr*8+cc])break;rr+=dr;cc+=dc;}}
 return out;
}
function ray(g,i,dr,dc){let found=[],r=(i>>3)+dr,c=(i&7)+dc;while(r>=0&&r<8&&c>=0&&c<8){const sq=r*8+c;if(g.board[sq])found.push(g.board[sq]);r+=dr;c+=dc;}return found;}
function detectMotifs(before,move,after){const us=before.turn,enemy=other(us),piece=after.board[move.to];if(!piece)return [];let motifs=[];
 if(after.check(enemy))motifs.push(after.legalMoves().length?'Шах':'Мат');
 if(move.promotion)motifs.push('Превращение пешки');
 let victims=attacksFrom(after,move.to).map(i=>after.board[i]).filter(p=>p&&color(p)===enemy&&VAL[type(p)]>=300);
 if(victims.length>=2&&type(piece)!=='k'&&victims.some(p=>VAL[type(p)]>=VAL[type(piece)]))motifs.push('Вилка');
 if(['b','r','q'].includes(type(piece)))for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]){
  if(type(piece)==='b'&&(!dr||!dc)||type(piece)==='r'&&dr&&dc)continue;
  const hits=ray(after,move.to,dr,dc);if(hits.length<2||color(hits[0])!==enemy||color(hits[1])!==enemy)continue;
  if(type(hits[1])==='k')motifs.push('Связка');else if(VAL[type(hits[0])]>VAL[type(hits[1])]+250)motifs.push('Сквозное нападение');
 }
 if(type(piece)!=='k'&&after.attacked(move.to,enemy)&&!after.attacked(move.to,us))motifs.push('Фигура под боем');
 if(before.board[move.to]||move.enpassant)motifs.push('Взятие');
 return [...new Set(motifs)];
}
function describeMove(e,before,after){const intro={brilliant:'Точная жертва с компенсацией.',best:'Движок считает этот ход сильнейшим.',excellent:'Очень близко к лучшему.',good:'Ход сохраняет приемлемую позицию.',inaccuracy:'Можно было сыграть точнее.',mistake:'Позиция заметно ухудшилась.',blunder:'Серьёзный промах: позиция резко ухудшилась.'};let a=[intro[e.kind]||''];const m=e.motifs||[];
 const positive=m.filter(x=>x!=='Взятие'&&x!=='Фигура под боем');if(positive.length)a.push('Тактический мотив: '+positive.join(', ').toLowerCase()+'.');
 if(m.includes('Фигура под боем'))a.push('Фигура на конечной клетке атакована без непосредственной защиты.');
 if(['inaccuracy','mistake','blunder'].includes(e.kind)&&e.best&&e.best!==e.played){a.push(`Вместо ${e.san} рассмотрите ${e.best.slice(0,2)}–${e.best.slice(2,4)}.`);if(e.loss>=100)a.push(`Потеря оценки — около ${(e.loss/100).toFixed(1)} пешки.`);}
 return a.join(' ');
}
function estimateRating(acc,moves,counts){if(acc==null||moves<6)return null;const mistakes=(counts.mistake||0)+2*(counts.blunder||0);const raw=500+(acc-40)*32-Math.min(240,12*mistakes);return Math.round(Math.max(400,Math.min(2800,raw))/50)*50;}
function retryCandidates(report,side='both'){return (report?.entries||[]).filter(e=>(side==='both'||e.side===side)&&e.best&&e.best!==e.played&&['inaccuracy','mistake','blunder'].includes(e.kind)).sort((a,b)=>b.loss-a.loss||a.ply-b.ply);}
function acceptableRetry(e,uci){if(!e||!uci)return false;if(e.best===uci)return true;const best=e.alternatives?.[0],alt=e.alternatives?.find(x=>x.uci===uci);if(!best||!alt)return false;return (best.score-alt.score)*(e.side==='w'?1:-1)<=35;}
const api={OPENINGS,lookupOpening,openingContinuations,openingSearch,attacksFrom,detectMotifs,describeMove,estimateRating,retryCandidates,acceptableRetry};root.OfflineChessInsights=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

const assert=require('node:assert/strict');
const {ChessGame}=require('../app/src/main/assets/chess-core.js');
const R=require('../app/src/main/assets/review-core.js');

let g=new ChessGame();
for(const [a,b] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6']])assert(g.move(a,b));
const fens=R.movesToFens(g.history);
assert.equal(fens.length,5);
assert.equal(fens[4],g.fen());
const positions=fens.map(fen=>R.fallbackPosition(fen));
const report=R.buildReview(g.history,positions,'approx','fast');
assert.equal(report.entries.length,4);
assert.equal(report.totals.w.moves,2);
assert.equal(report.totals.b.moves,2);
for(const entry of report.entries){
 assert(R.KINDS.includes(entry.kind));
 assert(entry.accuracy>=0&&entry.accuracy<=100);
 assert(entry.loss>=0);
 assert(typeof entry.comment==='string'&&entry.comment.length>10);
}
const serialized=JSON.parse(JSON.stringify(report));
assert.equal(serialized.positions.length,5);
assert.equal(R.variationSan(fens[0],['e2e4','e7e5','g1f3']),'e4 e5 Nf3');
assert.equal(R.variationSan(fens[0],['a1a8']), '');
assert.equal(R.moveAccuracy(0,0,'w'),100);
assert(R.moveAccuracy(0,-500,'w')<R.moveAccuracy(0,-50,'w'));
assert(R.moveAccuracy(0,500,'b')<R.moveAccuracy(0,50,'b'));
assert.equal(R.scoreLabel(9997),'М+3');
assert.equal(R.scoreLabel(-9998),'М−2');
assert.equal(R.scoreLabel(180),'+1.80');
const artificial=[
 {score:0,lines:[{uci:'d2d4',score:0,pv:['d2d4','d7d5']}]},
 {score:-500,lines:[{uci:'e7e5',score:-500,pv:['e7e5']}]},
 {score:-500,lines:[{uci:'g1f3',score:-500,pv:['g1f3']}]},
 {score:-530,lines:[{uci:'b8c6',score:-530,pv:['b8c6']}]},
 {score:-530,lines:[]}
];
const mocked=R.buildReview(g.history,artificial,'stockfish','deep');
assert.equal(mocked.entries[0].kind,'blunder');
assert.equal(mocked.entries[0].side,'w');
assert.equal(mocked.entries[0].loss,500);
assert.equal(mocked.entries[1].kind,'best');
assert.equal(mocked.totals.w.counts.blunder,1);
assert(mocked.totals.b.accuracy>mocked.totals.w.accuracy);
console.log('PASS: replay to FEN, alternative lines, classifications, move accuracy, brilliant count, chart data, report persistence format');

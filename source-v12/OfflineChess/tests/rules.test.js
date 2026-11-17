const assert=require('node:assert/strict');
const {ChessGame,engineMove,analyzeMove}=require('../app/src/main/assets/chess-core.js');
function perft(g,d){if(!d)return 1;let n=0;const snap=g.snapshot();for(const m of g.legalMoves()){g._apply(m);n+=perft(g,d-1);g.restore(snap);}return n;}
let g=new ChessGame();assert.equal(g.legalMoves().length,20);assert.equal(perft(g,2),400);assert.equal(perft(g,3),8902);
for(const [a,b] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']])assert(g.move(a,b));assert.equal(g.outcome().kind,'mate');assert.equal(g.outcome().winner,'b');assert(g.pgn().includes('Qh4#'));const dat=g.exportData();let restored=new ChessGame();restored.importData(dat);assert.equal(restored.fen(),g.fen());restored.undo();assert.equal(restored.history.length,3);
g=new ChessGame();for(const [a,b] of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5']])assert(g.move(a,b));assert(g.legalMoves().some(m=>m.enpassant));const ep=g.move('e5','d6');assert(ep&&ep.san==='exd6');assert.equal(g.board[27],null);
g=new ChessGame();for(const [a,b] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','c4'],['g8','f6']])assert(g.move(a,b));assert(g.legalMoves().some(m=>m.castle==='k'));assert.equal(g.move('e1','g1').san,'O-O');
g=new ChessGame('8/P6k/8/8/8/8/8/K7 w - - 0 1');assert(g.legalMoves().some(m=>m.promotion==='n'));assert.equal(g.move('a7','a8','q').san,'a8=Q');
g=new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');assert.equal(g.outcome().reason,'Пат');
g=new ChessGame();assert(engineMove(g,400).move);let move=g.legalMoves()[0];assert(analyzeMove(g,move).kind);
console.log('PASS: perft(1)=20, perft(2)=400, perft(3)=8902, mate, en-passant, castling, promotion, stalemate, save/restore, engine, annotation');

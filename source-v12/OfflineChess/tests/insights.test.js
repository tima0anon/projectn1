const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/chess-core.js'),I=require('../app/src/main/assets/insights-core.js');
assert.equal(I.OPENINGS.length,52);
for(const o of I.OPENINGS){const g=new C.ChessGame();for(const u of o.line)assert(g.move(u.slice(0,2),u.slice(2,4)),o.name+' '+u);assert.equal(I.lookupOpening(g.history).name,o.name);}
let g=new C.ChessGame('4k3/3r4/8/3N4/8/8/8/4K3 w - - 0 1'),before=g.copy(),m=g.move('d5','f6');assert(I.detectMotifs(before,m,g).includes('Вилка'));
g=new C.ChessGame('3k4/2n5/8/8/8/4B3/8/4K3 w - - 0 1');before=g.copy();m=g.move('e3','b6');assert(I.detectMotifs(before,m,g).includes('Связка'));
const e={side:'w',best:'e2e4',played:'d2d4',kind:'mistake',loss:200,alternatives:[{uci:'e2e4',score:50},{uci:'d2d4',score:0}]};
assert(I.acceptableRetry(e,'e2e4'));assert(!I.acceptableRetry(e,'d2d4'));
assert.equal(I.retryCandidates({entries:[e] },'w').length,1);
assert.equal(I.estimateRating(85,10,{}),1950);
assert.equal(I.estimateRating(85,5,{}),null);
const opening=new C.ChessGame();opening.move('e2','e4');assert(I.openingContinuations(opening.history).some(x=>x.uci==='c7c5'));
console.log('PASS: 52 opening lines, pins/forks, retry, estimated rating, opening continuations');

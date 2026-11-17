// Lightweight mocked DOM smoke test. Does not replace testing an actual Android WebView.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'../app/src/main/assets');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const map=new Map();
class FakeElement{
 constructor(id=''){this.id=id;this.innerHTML='';this.textContent='';this.hidden=false;this.disabled=false;this.style={};this.dataset={};this.events={};this.value='';this.scrollTop=0;this.scrollHeight=0;this.classList={add(){},remove(){},toggle(){},contains(){return false;}};}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 click(){for(const fn of this.events.click||[])fn({target:this});}
 querySelectorAll(){return [];}
 querySelector(){return new FakeElement();}
}
for(const id of ids){assert(!map.has(id),'Duplicate '+id);map.set(id,new FakeElement(id));}
const local=new Map();
const localStorage={getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
const fakeDoc={getElementById:id=>map.get(id)||null,querySelectorAll:()=>[],querySelector:()=>new FakeElement(),elementFromPoint:()=>null};
const warnings=[],logs=[];
const ctx=vm.createContext({console:{log:(...args)=>logs.push(args),warn:(...args)=>warnings.push(args),error:(...args)=>warnings.push(args)},document:fakeDoc,localStorage,Date,Math,JSON,setTimeout,clearTimeout,requestAnimationFrame:cb=>cb(),navigator:{},window:null});ctx.window=ctx;
for(const file of ['chess-core.js','insights-core.js','review-core.js','app.js','review-ui.js','openings-ui.js','retry-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
assert(ctx.OfflineChessReviewUI,'Review code must load');
assert(ctx.OfflineChessRetry,'Retry code must load');
const app=ctx.OfflineChessApp;
app.gl.game=new ctx.OfflineChessCore.ChessGame();
for(const [a,b] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','c4'],['g8','f6']])assert(app.gl.game.move(a,b));
app.gl.mode='coach';app.render();
map.get('review-start').click();
(async()=>{
 for(let i=0;i<100&&!app.gl.review;i++)await new Promise(r=>setTimeout(r,20));
 assert(app.gl.review,'Review should complete');
 assert.equal(app.gl.review.entries.length,6);
 assert(map.get('review-stats').innerHTML.includes('Грубая ошибка'));
 assert(map.get('review-rating').innerHTML.includes('Оценка силы'));
 assert(map.get('opening-list').innerHTML.includes('Сицилианская'));
 assert(map.get('review-chart').innerHTML.includes('graph-line'));
 assert(map.get('review-history').innerHTML.includes('history-move'));
 map.get('review-next').click();
 assert(map.get('review-move-title').textContent.length);
 map.get('review-best').click();
 assert(map.get('review-board').innerHTML.includes('review-arrow')||map.get('review-best').disabled);
 assert(localStorage.getItem('offlinechess_current').includes('"review":'));
 app.gl.game.move('d2','d3');
 ctx.OfflineChessReviewUI.invalidate();
 assert.equal(app.gl.review,null);
 assert(!warnings.length,'Warnings: '+JSON.stringify(warnings));
 console.log('PASS: UI scripts load, report renders, chart and move list exist, navigation, persistence, invalidation (mock DOM)');
})().catch(e=>{console.error(e);process.exitCode=1});

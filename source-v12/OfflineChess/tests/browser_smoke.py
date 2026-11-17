"""Real Chromium UI smoke test without network. Playwright and Chromium required."""
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]/'app/src/main/assets'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
 page=b.new_page(viewport={'width':390,'height':844});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  file=ROOT/urlparse(r.request.url).path.lstrip('/')
  ext=file.suffix
  if file.is_file():r.fulfill(status=200,body=file.read_bytes(),content_type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}.get(ext,'text/html'))
  else:r.abort()
 page.route('**/*',route)
 page.evaluate("() => {const db=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>db.has(k)?db.get(k):null,setItem:(k,v)=>db.set(k,String(v)),removeItem:k=>db.delete(k)}})}")
 page.set_content('<base href="http://offline.local/">'+(ROOT/'index.html').read_text(),wait_until='load')
 assert page.locator('#board .cell').count()==64
 assert page.locator('#board img').count()==32
 page.locator('#start-game').click()
 page.locator('[data-screen="openings"]').click()
 assert page.locator('.opening-item').count()==52
 page.locator('#opening-search').fill('Сицилианская')
 assert page.locator('.opening-item').count()>=3
 page.locator('.opening-item').first.click()
 assert page.locator('#opening-preview-board .cell').count()==64
 page.locator('[data-screen="review"]').click()
 page.evaluate('''() => {let a=window.OfflineChessApp,R=window.OfflineChessReview,G=window.OfflineChessCore.ChessGame;
  a.gl.game=new G();a.gl.side='w';a.gl.orientation='w';
  for(const u of ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','d2d3','f8c5','c2c3','d7d6','e1g1','e8g8'])a.gl.game.move(u.slice(0,2),u.slice(2,4));
  const report=R.buildReview(a.gl.game.history,R.movesToFens(a.gl.game.history).map(R.fallbackPosition),'approx','fast');
  for(const e of report.entries){e.kind='good';e.loss=10;}
  const e=report.entries[2];e.kind='mistake';e.loss=180;e.best='d2d4';e.comment='Вместо Nf3 сыграйте d4.';
  a.gl.review=report;a.render();}''')
 page.locator('[data-screen="game"]').click();page.locator('[data-screen="review"]').click()
 assert page.locator('#review-chart circle').count()==12
 assert 'Оценка силы' in page.locator('#review-rating').inner_text()
 page.locator('#retry-start').click()
 assert page.locator('#retry-board .cell').count()==64
 page.locator('[data-retry-square="51"]').click()  # d2
 page.locator('[data-retry-square="35"]').click()  # d4
 assert 'Верно!' in page.locator('#retry-feedback').inner_text()
 assert not errors,errors
 b.close()
 print('PASS: Chromium mobile board, 12 SVG pieces, opening catalog, review graph and successful retry')

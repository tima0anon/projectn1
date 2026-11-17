package com.offlinechess.app;
import android.test.ActivityInstrumentationTestCase2;
import android.webkit.WebView;
import java.lang.reflect.Field;
import java.util.concurrent.*;
public class BuildTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public BuildTest(){super(MainActivity.class);}
    private WebView web() {
        try {Field f=MainActivity.class.getDeclaredField("web");f.setAccessible(true);return (WebView)f.get(getActivity());}
        catch(Exception e){throw new RuntimeException(e);}
    }
    private String eval(String code)throws Exception{
        CompletableFuture<String> result=new CompletableFuture<>();
        getInstrumentation().runOnMainSync(()->web().evaluateJavascript(code,result::complete));
        return result.get(5,TimeUnit.SECONDS);
    }
    private void until(String code)throws Exception{
        long deadline=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<deadline){if("true".equals(eval(code)))return;Thread.sleep(150);}
        fail("Timed out: "+code+"; engine="+eval("window.Android.engineAvailable()"));
    }
    public void testNativeMovesReportAndRestore()throws Exception{
        getActivity();until("!!window.OfflineChessApp && !!window.OfflineChessReviewUI");
        assertEquals("true",eval("window.Android.engineAvailable()"));
        eval("window.OfflineChessApp.gl.setupMode='play';window.OfflineChessApp.gl.setupColor='w';window.OfflineChessApp.gl.setupElo=1600;document.getElementById('start-game').click();window.nativeReply=null;window.originalReply=window.stockfishResult;window.stockfishResult=(id,m,s)=>{window.nativeReply=m;window.originalReply(id,m,s)};true");
        until("document.querySelectorAll('#board img').length===32");
        assertEquals("64",eval("document.querySelectorAll('#board .cell').length"));
        until("Array.from(document.querySelectorAll('#board img')).every(p=>p.complete&&p.naturalWidth>0)");
        eval("(()=>{const a=document.querySelectorAll('#board .cell')[52],b=document.querySelectorAll('#board .cell')[36],r=a.getBoundingClientRect(),t=b.getBoundingClientRect();a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:t.x+t.width/2,clientY:t.y+t.height/2}));return true;})()");
        until("window.OfflineChessApp.gl.game.history.length===2 && !window.OfflineChessApp.gl.busy");
        assertEquals("true",eval("/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(window.nativeReply||'')"));
        assertEquals("true",eval("window.OfflineChessApp.gl.game.history[0].fromSquare==='e2'"));
        eval("document.querySelector('[data-screen=review]').click();document.getElementById('review-start').click();true");
        until("!!window.OfflineChessApp.gl.review");
        assertEquals("true",eval("window.OfflineChessApp.gl.review.engine==='stockfish'"));
        assertEquals("2",eval("window.OfflineChessApp.gl.review.entries.length"));
        assertEquals("3",eval("window.OfflineChessApp.gl.review.positions[0].lines.length"));
        assertEquals("7",eval("document.querySelectorAll('#review-stats .stats-row').length"));
        assertEquals("2",eval("document.querySelectorAll('#review-chart circle').length"));
        assertEquals("true",eval("document.documentElement.scrollWidth<=window.innerWidth"));
        getInstrumentation().runOnMainSync(()->web().reload());
        until("!!window.OfflineChessApp && !!window.OfflineChessApp.gl.review");
        assertEquals("2",eval("window.OfflineChessApp.gl.review.entries.length"));
        assertEquals("true",eval("window.OfflineChessApp.gl.review.engine==='stockfish'"));
        eval("document.querySelector('[data-screen=review]').click();document.getElementById('review-deep').click();document.getElementById('review-start').click();document.getElementById('review-cancel').click();true");
        assertEquals("false",eval("document.getElementById('review-start').disabled"));
        eval("window.OfflineChessApp.gl.setupColor='b';window.OfflineChessApp.gl.setupElo=1600;document.getElementById('start-game').click();window.nativeReply=null;window.originalReply=window.stockfishResult;window.stockfishResult=(id,m,s)=>{window.nativeReply=m;window.originalReply(id,m,s)};true");
        until("window.OfflineChessApp.gl.game.history.length===1 && !window.OfflineChessApp.gl.busy");
        assertEquals("true",eval("/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(window.nativeReply||'')"));
    }
}

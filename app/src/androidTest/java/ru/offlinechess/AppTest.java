package ru.offlinechess;
import android.test.ActivityInstrumentationTestCase2;
import java.util.concurrent.*;
public class AppTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public AppTest(){super(MainActivity.class);}
    private String eval(String code)throws Exception{
        CompletableFuture<String> result=new CompletableFuture<>();
        getInstrumentation().runOnMainSync(()->getActivity().web.evaluateJavascript(code,result::complete));
        return result.get(5,TimeUnit.SECONDS);
    }
    private void until(String expression)throws Exception{
        long end=System.currentTimeMillis()+45000;
        while(System.currentTimeMillis()<end){if("true".equals(eval(expression)))return;Thread.sleep(150);}
        fail("Timed out: "+expression+"; status="+eval("document.getElementById('status').textContent"));
    }
    public void testOfflineEngineAndPersistence()throws Exception{
        getActivity();until("typeof restore==='function'");
        eval("document.getElementById('setup').close();restore({moves:[],human:'w',elo:1500,mode:'game'});tap('e2');tap('e4');true");
        until("game.history().length===2 && !busy");
        assertEquals("null",eval("error || null"));
        assertEquals("true",eval("game.turn()==='w'"));
        eval("saveGame(false);undo();true");
        assertEquals("0",eval("game.history().length"));
        eval("restore(JSON.parse(Native.read('archive'))[0]);true");
        assertEquals("2",eval("game.history().length"));
        eval("restore({moves:[],human:'b',elo:400});true");
        until("game.history().length===1 && !busy");
        assertEquals("true",eval("game.turn()==='b'"));
        assertEquals("64",eval("document.querySelectorAll('.square').length"));
        eval("restore({moves:[],human:'w',elo:1200});true");
    }
    public void testCoachPracticeAndClassicPieces()throws Exception{
        getActivity();until("typeof restore==='function'");
        eval("document.getElementById('setup').close();restore({moves:[],human:'w',elo:1500,mode:'learn'});window.oldPawn=document.querySelector('#pieces [data-square=e2]');tap('e2');tap('e4');true");
        assertEquals("true",eval("oldPawn===document.querySelector('#pieces [data-square=e4]')"));
        until("reviews[0] && awaiting && !busy");
        assertEquals("1",eval("game.history().length"));
        assertEquals("true",eval("reviews[0].depthBefore>3 && reviews[0].depthAfter>3"));
        assertEquals("true",eval("Number.isFinite(reviews[0].whiteBefore) && Number.isFinite(reviews[0].whiteAfter)"));
        until("Array.from(document.querySelectorAll('#pieces img')).every(p=>p.complete && p.naturalWidth>0)");
        assertEquals("32",eval("document.querySelectorAll('#pieces img').length"));
        assertEquals("true",eval("getComputedStyle(oldPawn).transitionProperty.includes('transform')"));
        assertEquals("true",eval("document.querySelector('[data-square=a1]').classList.contains('dark')"));
        eval("document.getElementById('continue').click();true");
        until("game.history().length===2 && reviews[1] && !busy");
        assertEquals("2",eval("document.querySelectorAll('#moveRows .quality').length"));
        assertEquals("false",eval("awaiting"));
        eval("setMode('practice');tap('g1');tap('f3');true");
        until("game.history().length===4 && reviews[3] && !busy");
        assertEquals("4",eval("document.querySelectorAll('#moveRows .quality').length"));
        assertEquals("2",eval("document.querySelectorAll('#moveRows tr').length"));
        assertEquals("false",eval("document.getElementById('moveBadge').hidden"));
        assertEquals("true",eval("document.documentElement.scrollWidth<=window.innerWidth"));
        eval("saveGame(false);restore({moves:[],human:'w',elo:1200});restore(JSON.parse(Native.read('archive'))[0]);true");
        assertEquals("true",eval("mode===\'practice\'"));
        assertEquals("4",eval("reviews.filter(Boolean).length"));
        eval("restore({moves:[],human:'w',elo:1200});true");
    }
}

package ru.offlinechess;
import android.test.ActivityInstrumentationTestCase2;
import android.webkit.WebView;
import java.util.concurrent.*;
public class AppTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public AppTest(){super(MainActivity.class);}
    private String eval(String code)throws Exception{
        CompletableFuture<String> result=new CompletableFuture<>();
        getInstrumentation().runOnMainSync(()->getActivity().web.evaluateJavascript(code,result::complete));
        return result.get(5,TimeUnit.SECONDS);
    }
    private void until(String expression)throws Exception{
        long end=System.currentTimeMillis()+25000;
        while(System.currentTimeMillis()<end){if("true".equals(eval(expression)))return;Thread.sleep(150);}
        fail("Timed out: "+expression+"; status="+eval("document.getElementById('status').textContent"));
    }
    public void testOfflineEngineAndPersistence()throws Exception{
        getActivity();
        until("typeof restore==='function'");
        eval("document.getElementById('setup').close();restore({moves:[],human:'w',elo:1500});tap('e2');tap('e4');true");
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
        eval("undo();restore({moves:[],human:'w',elo:1200});true");
    }
}

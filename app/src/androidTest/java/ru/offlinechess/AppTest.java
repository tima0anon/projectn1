package ru.offlinechess;
import android.test.ActivityInstrumentationTestCase2;
import java.util.concurrent.*;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.InputDevice;
import org.json.JSONArray;
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
        fail("Timed out: "+expression+"; status="+eval("document.getElementById('status').textContent")+"; pointer="+eval("JSON.stringify({last:window.lastPointer,drag:drag&&drag.from,error:window.pointerError})"));
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

    public void testTouchDragMoves()throws Exception{
        getActivity();until("typeof restore==='function'");
        eval("document.getElementById('setup').close();restore({moves:[],human:'w',elo:1500,mode:'game'});document.addEventListener('pointerdown',e=>window.lastPointer=[e.clientX,e.clientY],true);window.addEventListener('error',e=>window.pointerError=e.message);true");
        until("document.querySelector('#pieces [data-square=e2]').complete");
        JSONArray points=new JSONArray(eval("(()=>{const r=document.getElementById('board').getBoundingClientRect();return [r.left+r.width*4.5/8,r.top+r.height*6.5/8,r.left+r.width*4.5/8,r.top+r.height*4.5/8]})()"));
        int[] size=new int[2];
        getInstrumentation().runOnMainSync(()->{
            getActivity().web.requestFocus();size[0]=getActivity().web.getWidth();size[1]=getActivity().web.getHeight();
        });
        float probeX=size[0]/2f,probeY=size[1]/2f;
        long probe=SystemClock.uptimeMillis();inject(probe,MotionEvent.ACTION_DOWN,probeX,probeY);
        until("Array.isArray(window.lastPointer)");
        JSONArray first=new JSONArray(eval("window.lastPointer"));
        inject(probe,MotionEvent.ACTION_CANCEL,probeX,probeY);
        eval("window.lastPointer=null;true");
        probe=SystemClock.uptimeMillis();inject(probe,MotionEvent.ACTION_DOWN,probeX+40,probeY+40);
        until("Array.isArray(window.lastPointer)");
        JSONArray second=new JSONArray(eval("window.lastPointer"));
        inject(probe,MotionEvent.ACTION_CANCEL,probeX+40,probeY+40);
        float scaleX=40f/(float)(second.getDouble(0)-first.getDouble(0));
        float scaleY=40f/(float)(second.getDouble(1)-first.getDouble(1));
        float fromX=probeX+40+((float)points.getDouble(0)-(float)second.getDouble(0))*scaleX;
        float fromY=probeY+40+((float)points.getDouble(1)-(float)second.getDouble(1))*scaleY;
        float toX=probeX+40+((float)points.getDouble(2)-(float)second.getDouble(0))*scaleX;
        float toY=probeY+40+((float)points.getDouble(3)-(float)second.getDouble(1))*scaleY;
        long down=SystemClock.uptimeMillis();inject(down,MotionEvent.ACTION_DOWN,fromX,fromY);
        until("drag && drag.from==='e2'");
        for(int i=1;i<=8;i++){Thread.sleep(40);float t=i/8f;inject(down,MotionEvent.ACTION_MOVE,fromX+(toX-fromX)*t,fromY+(toY-fromY)*t);}
        inject(down,MotionEvent.ACTION_UP,toX,toY);
        until("game.history().length>=1");
        assertEquals("true",eval("game.history()[0]==='e4'"));
        until("game.history().length===2 && !busy");
        eval("restore({moves:[],human:'w',elo:1200});true");
    }
    private void inject(long down,int action,float x,float y){
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,y,0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        getInstrumentation().runOnMainSync(()->getActivity().web.dispatchTouchEvent(event));event.recycle();
    }
}

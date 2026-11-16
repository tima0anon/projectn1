package ru.offlinechess;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.*;
import android.view.*;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    WebView web;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger generation=new AtomicInteger();
    private volatile Process engine;
    private volatile boolean closed;
    private String exportPgn;
    private final Bridge bridge=new Bridge();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(27,30,33));
        getWindow().setNavigationBarColor(Color.rgb(27,30,33));
        web=new WebView(this);web.setBackgroundColor(Color.rgb(27,30,33));
        if(android.os.Build.VERSION.SDK_INT>=30) web.setOnApplyWindowInsetsListener((v,insets)->{
            android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
            v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;
        });
        else web.setOnApplyWindowInsetsListener((v,insets)->{
            v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setBlockNetworkLoads(true);
        web.getSettings().setDefaultTextEncodingName("UTF-8");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
        });
        web.addJavascriptInterface(bridge,"Native");
        web.loadUrl("file:///android_asset/index.html");
    }
    private SharedPreferences prefs(){return getSharedPreferences("chess",MODE_PRIVATE);}
    private void js(String code){runOnUiThread(()->{if(!closed)web.evaluateJavascript(code,null);});}
    private void cancelEngine(){generation.incrementAndGet();Process p=engine;if(p!=null)p.destroy();}
    private static boolean valid(String moves){return moves.matches("([a-h][1-8][a-h][1-8][qrbn]?( [a-h][1-8][a-h][1-8][qrbn]?)*)?");}

    private class Session implements AutoCloseable {
        final Process process;
        final BufferedWriter input;
        final BufferedReader output;
        final ScheduledFuture<?> timeout;
        Session(int token)throws Exception{
            process=new ProcessBuilder(getApplicationInfo().nativeLibraryDir+"/libstockfish.so").redirectErrorStream(true).start();
            engine=process;
            timeout=timer.schedule(()->process.destroy(),30,TimeUnit.SECONDS);
            input=new BufferedWriter(new OutputStreamWriter(process.getOutputStream(),StandardCharsets.UTF_8));
            output=new BufferedReader(new InputStreamReader(process.getInputStream(),StandardCharsets.UTF_8));
            try{
                if(token!=generation.get()||closed)throw new IOException("Cancelled");
                send("uci");waitFor("uciok");send("setoption name Threads value 1");send("setoption name Hash value 48");
                send("isready");waitFor("readyok");
            }catch(Exception e){close();throw e;}
        }
        void send(String s)throws IOException{input.write(s);input.newLine();input.flush();}
        void waitFor(String marker)throws IOException{
            String s;while((s=output.readLine())!=null)if(s.equals(marker))return;
            throw new IOException("Stockfish: "+marker);
        }
        JSONObject analyse(String moves,String command)throws Exception{
            send("position startpos"+(moves.isEmpty()?"":" moves "+moves));send(command);
            JSONObject result=new JSONObject();String line,best=null;
            while((line=output.readLine())!=null){
                if(line.startsWith("info ")&&line.contains(" score ")&&!line.contains("lowerbound")&&!line.contains("upperbound")){
                    String[] words=line.split("\\s+");
                    for(int i=0;i<words.length-1;i++){
                        if(words[i].equals("depth"))result.put("depth",Integer.parseInt(words[i+1]));
                        if(words[i].equals("score")&&i+2<words.length){
                            int value=Integer.parseInt(words[i+2]);
                            if(words[i+1].equals("mate")){
                                result.put("mate",value);result.put("cp",value==0?-100000:(value>0?1:-1)*(100000-Math.min(99,Math.abs(value))*100));
                            }else if(words[i+1].equals("cp")){result.remove("mate");result.put("cp",value);}
                        }
                        if(words[i].equals("pv")){
                            StringBuilder pv=new StringBuilder();for(int k=i+1;k<words.length;k++){if(pv.length()>0)pv.append(' ');pv.append(words[k]);}
                            result.put("pv",pv.toString());break;
                        }
                    }
                }
                if(line.startsWith("bestmove ")){best=line.split(" ")[1];break;}
            }
            if(best==null)throw new IOException("Stockfish stopped");
            result.put("best",best.equals("(none)")||best.equals("0000")?"":best);
            return result;
        }
        @Override public void close(){timeout.cancel(false);process.destroy();if(engine==process)engine=null;}
    }
    public class Bridge {
        @JavascriptInterface public String read(String key){return prefs().getString(key,"");}
        @JavascriptInterface public void write(String key,String value){prefs().edit().putString(key,value).commit();}
        @JavascriptInterface public void cancel(){cancelEngine();}
        @JavascriptInterface public void search(int request,String moves,int elo){
            cancelEngine();final int token=generation.get();
            if(!valid(moves))return;final int rating=Math.max(400,Math.min(3000,elo));
            worker.execute(()->{
                if(token!=generation.get()||closed)return;
                try(Session s=new Session(token)){
                    if(rating>=1320){s.send("setoption name UCI_LimitStrength value true");s.send("setoption name UCI_Elo value "+rating);}
                    else s.send("setoption name Skill Level value "+Math.max(0,(rating-400)/100));
                    JSONObject result=s.analyse(moves,"go movetime "+(rating>=2200?1000:rating>=1320?650:250));
                    String best=result.getString("best");if(best.isEmpty())throw new IOException("No move");
                    if(token==generation.get())js("onEngine("+request+","+JSONObject.quote(best)+",null)");
                }catch(Exception e){
                    if(token==generation.get())js("onEngine("+request+",null,"+JSONObject.quote("Не удалось запустить Stockfish. Нажмите «Повторить».")+")");
                }
            });
        }
        @JavascriptInterface public void review(int request,String before,String move){
            cancelEngine();final int token=generation.get();
            if(!valid(before)||!move.matches("[a-h][1-8][a-h][1-8][qrbn]?"))return;
            worker.execute(()->{
                if(token!=generation.get()||closed)return;
                try(Session s=new Session(token)){
                    s.send("setoption name UCI_LimitStrength value false");s.send("setoption name Skill Level value 20");
                    JSONObject first=s.analyse(before,"go depth 16 movetime 1100");
                    if(token!=generation.get())return;
                    JSONObject second=s.analyse(before+(before.isEmpty()?"":" ")+move,"go depth 16 movetime 1100");
                    if(!first.has("cp")||!second.has("cp"))throw new IOException("Missing evaluation");
                    JSONObject result=new JSONObject().put("before",first).put("after",second);
                    if(token==generation.get())js("onReview("+request+","+result.toString()+",null)");
                }catch(Exception e){
                    if(token==generation.get())js("onReview("+request+",null,"+JSONObject.quote("Оценка временно недоступна. Повторите анализ.")+")");
                }
            });
        }
        @JavascriptInterface public void export(String pgn){
            runOnUiThread(()->{
                exportPgn=pgn;
                Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/x-chess-pgn").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"chess-"+System.currentTimeMillis()+".pgn");
                startActivityForResult(i,10);
            });
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==10&&result==RESULT_OK&&data!=null&&exportPgn!=null){
            try(OutputStream out=getContentResolver().openOutputStream(data.getData())){
                if(out==null)throw new IOException();out.write(exportPgn.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this,"PGN сохранён",Toast.LENGTH_SHORT).show();
            }catch(IOException e){Toast.makeText(this,"Не удалось сохранить файл",Toast.LENGTH_LONG).show();}
        }
    }
    @Override protected void onDestroy(){closed=true;cancelEngine();worker.shutdownNow();timer.shutdownNow();web.removeJavascriptInterface("Native");web.destroy();super.onDestroy();}
}

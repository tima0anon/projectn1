package ru.offlinechess;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
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
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger generation = new AtomicInteger();
    private volatile Process engine;
    private volatile boolean closed;
    private String exportPgn;
    private final Bridge bridge = new Bridge();

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(23,29,28));
        getWindow().setNavigationBarColor(Color.rgb(23,29,28));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(23,29,28));
        web.setOnApplyWindowInsetsListener((v,insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
            return insets;
        });
        // API 26-29 use the legacy inset accessors.
        if (android.os.Build.VERSION.SDK_INT < 30) web.setOnApplyWindowInsetsListener((v,insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets;
        });
        setContentView(web);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setBlockNetworkLoads(true);
        web.getSettings().setDefaultTextEncodingName("UTF-8");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        web.addJavascriptInterface(bridge,"Native");
        web.loadUrl("file:///android_asset/index.html");
    }
    private SharedPreferences prefs() { return getSharedPreferences("chess",MODE_PRIVATE); }
    private void js(String s) { runOnUiThread(() -> { if(!closed) web.evaluateJavascript(s,null); }); }
    private void cancelEngine() {
        generation.incrementAndGet();
        Process p=engine; if(p!=null) p.destroy();
    }
    public class Bridge {
        @JavascriptInterface public String read(String key) { return prefs().getString(key,""); }
        @JavascriptInterface public void write(String key,String value) { prefs().edit().putString(key,value).commit(); }
        @JavascriptInterface public void cancel() { cancelEngine(); }
        @JavascriptInterface public void export(String pgn) {
            runOnUiThread(() -> {
                exportPgn=pgn;
                Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/x-chess-pgn").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"chess-"+System.currentTimeMillis()+".pgn");
                startActivityForResult(i,10);
            });
        }
        @JavascriptInterface public void search(int request,String moves,int elo) {
            cancelEngine();
            final int token=generation.get();
            if(!moves.matches("([a-h][1-8][a-h][1-8][qrbn]?( [a-h][1-8][a-h][1-8][qrbn]?)*)?")) return;
            final int rating=Math.max(400,Math.min(3000,elo));
            worker.execute(() -> {
                if(token!=generation.get() || closed) return;
                Process p=null; ScheduledFuture<?> timeout=null;
                try {
                    p=new ProcessBuilder(getApplicationInfo().nativeLibraryDir+"/libstockfish.so").redirectErrorStream(true).start();
                    engine=p;
                    if(token!=generation.get()) { p.destroy(); return; }
                    final Process active=p;
                    timeout=timer.schedule(() -> active.destroy(),15,TimeUnit.SECONDS);
                    BufferedWriter input=new BufferedWriter(new OutputStreamWriter(p.getOutputStream(),StandardCharsets.UTF_8));
                    BufferedReader output=new BufferedReader(new InputStreamReader(p.getInputStream(),StandardCharsets.UTF_8));
                    send(input,"uci"); waitFor(output,"uciok");
                    send(input,"setoption name Threads value 1");
                    send(input,"setoption name Hash value 32");
                    if(rating>=1320) {
                        send(input,"setoption name UCI_LimitStrength value true");
                        send(input,"setoption name UCI_Elo value "+rating);
                    } else {
                        send(input,"setoption name Skill Level value "+Math.max(0,(rating-400)/100));
                    }
                    send(input,"isready"); waitFor(output,"readyok");
                    send(input,"position startpos"+(moves.isEmpty()?"":" moves "+moves));
                    send(input,"go movetime "+(rating>=2200?1000:rating>=1320?650:250));
                    String line,best=null;
                    while((line=output.readLine())!=null) if(line.startsWith("bestmove ")) { best=line.split(" ")[1]; break; }
                    if(best==null || best.equals("(none)") || best.equals("0000")) throw new IOException("Движок не вернул ход");
                    if(token==generation.get()) js("onEngine("+request+","+JSONObject.quote(best)+",null)");
                } catch(Exception e) {
                    if(token==generation.get()) js("onEngine("+request+",null,"+JSONObject.quote("Не удалось запустить Stockfish. Нажмите «Повторить».")+")");
                } finally {
                    if(timeout!=null) timeout.cancel(false);
                    if(p!=null) p.destroy();
                    if(engine==p) engine=null;
                }
            });
        }
    }
    private static void send(BufferedWriter w,String command) throws IOException { w.write(command); w.newLine(); w.flush(); }
    private static void waitFor(BufferedReader r,String marker) throws IOException {
        String s; while((s=r.readLine())!=null) if(s.equals(marker)) return;
        throw new IOException("Stockfish: "+marker);
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if(request==10 && result==RESULT_OK && data!=null && exportPgn!=null) {
            try(OutputStream out=getContentResolver().openOutputStream(data.getData())) {
                if(out==null) throw new IOException();
                out.write(exportPgn.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this,"PGN сохранён",Toast.LENGTH_SHORT).show();
            } catch(IOException e) { Toast.makeText(this,"Не удалось сохранить файл",Toast.LENGTH_LONG).show(); }
        }
    }
    @Override protected void onDestroy() {
        closed=true; cancelEngine(); worker.shutdownNow(); timer.shutdownNow();
        web.removeJavascriptInterface("Native"); web.destroy(); super.onDestroy();
    }
}

package com.offlinechess.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    private WebView web;
    // Serial execution: only one UCI search can use this Stockfish process at once.
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicInteger activeReviewId = new AtomicInteger(-1);
    private Process engine;
    private BufferedReader reader;
    private BufferedWriter writer;

    @Override @SuppressLint("SetJavaScriptEnabled")
    public void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);
        web.setBackgroundColor(0xff151918);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new AppBridge(), "Android");
        web.loadUrl("file:///android_asset/index.html");
    }

    private File engineBinary() {
        return new File(getApplicationInfo().nativeLibraryDir, "libstockfish.so");
    }

    private void emit(String javascript) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(javascript, null); });
    }

    public class AppBridge {
        @JavascriptInterface public boolean engineAvailable() {
            return engineBinary().exists() && engineBinary().canExecute();
        }
        @JavascriptInterface public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager manager = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                manager.setPrimaryClip(ClipData.newPlainText("Chess PGN / report", text));
            });
        }
        @JavascriptInterface public void requestMove(String fen, int elo, int requestId) {
            worker.submit(() -> {
                String move = null;
                try { move = computeMove(fen, elo); }
                catch (Exception e) { Log.e("OfflineChess", "Stockfish move failed", e); resetEngine(); }
                String result = move == null ? "null" : JSONObject.quote(move);
                emit("window.stockfishResult(" + requestId + "," + result + ",null);");
            });
        }
        @JavascriptInterface public void requestReview(String fensJson, int requestId, int moveTimeMs) {
            activeReviewId.set(requestId);
            worker.submit(() -> {
                try {
                    JSONArray fens = new JSONArray(fensJson);
                    if (fens.length() < 2 || fens.length() > 401) throw new IllegalArgumentException("Unsupported game length");
                    ensureEngine();
                    sendUci("setoption name UCI_LimitStrength value false");
                    sendUci("setoption name MultiPV value 3");
                    sendUci("ucinewgame");
                    sendUci("isready");
                    waitForPrefix("readyok");
                    int ms = Math.max(100, Math.min(2500, moveTimeMs));
                    for (int i = 0; i < fens.length() && activeReviewId.get() == requestId; i++) {
                        JSONObject position = analyzePosition(fens.getString(i), ms);
                        if (activeReviewId.get() != requestId) break;
                        emit("window.reviewPositionResult(" + requestId + "," + i + "," + position.toString() + ");");
                    }
                    if (activeReviewId.get() == requestId) emit("window.reviewFinished(" + requestId + ",null);");
                } catch (Exception e) {
                    Log.e("OfflineChess", "Stockfish review failed", e);
                    resetEngine();
                    if (activeReviewId.get() == requestId)
                        emit("window.reviewFinished(" + requestId + "," + JSONObject.quote("Движок анализа недоступен") + ");");
                }
            });
        }
        @JavascriptInterface public void cancelReview(int requestId) {
            activeReviewId.compareAndSet(requestId, -1);
        }
    }

    private synchronized void ensureEngine() throws Exception {
        if (engine != null && engine.isAlive()) return;
        File binary = engineBinary();
        if (!binary.exists()) throw new IllegalStateException("Stockfish binary not bundled");
        engine = new ProcessBuilder(binary.getAbsolutePath()).directory(getFilesDir()).redirectErrorStream(true).start();
        reader = new BufferedReader(new InputStreamReader(engine.getInputStream(), StandardCharsets.UTF_8));
        writer = new BufferedWriter(new OutputStreamWriter(engine.getOutputStream(), StandardCharsets.UTF_8));
        sendUci("uci");
        waitForPrefix("uciok");
        sendUci("setoption name Threads value 1");
        sendUci("setoption name Hash value 24");
        sendUci("isready");
        waitForPrefix("readyok");
    }

    private void sendUci(String msg) throws Exception {
        writer.write(msg);
        writer.newLine();
        writer.flush();
    }
    private String waitForPrefix(String prefix) throws Exception {
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.startsWith(prefix)) return line;
        }
        throw new IllegalStateException("Stockfish closed before " + prefix);
    }

    private synchronized String computeMove(String fen, int elo) throws Exception {
        ensureEngine();
        sendUci("setoption name MultiPV value 1");
        sendUci("setoption name UCI_LimitStrength value true");
        sendUci("setoption name UCI_Elo value " + Math.max(1320, Math.min(2800, elo)));
        sendUci("isready");
        waitForPrefix("readyok");
        sendUci("position fen " + fen);
        sendUci("go movetime 350");
        String line = waitForPrefix("bestmove");
        String[] parts = line.split("\\s+");
        return parts.length > 1 && parts[1].matches("[a-h][1-8][a-h][1-8][qrbn]?") ? parts[1] : null;
    }

    private static class Variation {
        int depth = -1;
        int whiteScore = 0;
        String[] pv;
    }

    // Stockfish's UCI cp/mate scores are from the side-to-move perspective.
    // All evaluations sent to JS are normalized to WHITE, including for black to move.
    private JSONObject analyzePosition(String fen, int timeMs) throws Exception {
        if (!fen.matches("[a-zA-Z1-8/]+ [wb] [KQkq-]+ [a-h1-8-]+ [0-9]+ [0-9]+"))
            throw new IllegalArgumentException("Invalid FEN");
        int sign = fen.split(" ")[1].equals("w") ? 1 : -1;
        sendUci("position fen " + fen);
        sendUci("go movetime " + timeMs);
        Map<Integer, Variation> bestLines = new HashMap<>();
        String bestUci = null;
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.startsWith("bestmove")) {
                String[] best = line.split("\\s+");
                if (best.length > 1 && best[1].matches("[a-h][1-8][a-h][1-8][qrbn]?")) bestUci = best[1];
                break;
            }
            if (!line.startsWith("info ") || !line.contains(" score ") || !line.contains(" pv ")) continue;
            if (line.contains(" lowerbound") || line.contains(" upperbound")) continue;
            String[] t = line.split("\\s+");
            int depth = -1, rank = 1, score = 0;
            boolean haveScore = false;
            String[] pv = null;
            for (int k = 1; k < t.length; k++) {
                switch (t[k]) {
                    case "depth": if (k + 1 < t.length) depth = Integer.parseInt(t[++k]); break;
                    case "multipv": if (k + 1 < t.length) rank = Integer.parseInt(t[++k]); break;
                    case "score":
                        if (k + 2 < t.length) {
                            String kind = t[++k];
                            int val = Integer.parseInt(t[++k]);
                            score = "mate".equals(kind) ? (val >= 0 ? 1 : -1) * (10000 - Math.min(999, Math.abs(val))) : val;
                            haveScore = "cp".equals(kind) || "mate".equals(kind);
                        }
                        break;
                    case "pv":
                        int n = Math.min(8, t.length - k - 1);
                        pv = new String[n];
                        System.arraycopy(t, k + 1, pv, 0, n);
                        k = t.length;
                        break;
                    default: break;
                }
            }
            if (haveScore && depth >= 0 && rank >= 1 && rank <= 3 && pv != null && pv.length > 0) {
                Variation previous = bestLines.get(rank);
                if (previous == null || depth >= previous.depth) {
                    Variation variation = new Variation();
                    variation.depth = depth;
                    variation.whiteScore = sign * score;
                    variation.pv = pv;
                    bestLines.put(rank, variation);
                }
            }
        }
        if (line == null) throw new IllegalStateException("Stockfish closed during analysis");
        JSONArray alternatives = new JSONArray();
        int whiteScore = 0;
        for (int rank = 1; rank <= 3; rank++) {
            Variation v = bestLines.get(rank);
            if (v == null) continue;
            JSONObject option = new JSONObject();
            option.put("uci", v.pv[0]);
            option.put("score", v.whiteScore);
            JSONArray pv = new JSONArray();
            for (String step : v.pv) if (step.matches("[a-h][1-8][a-h][1-8][qrbn]?")) pv.put(step);
            option.put("pv", pv);
            alternatives.put(option);
            if (rank == 1) whiteScore = v.whiteScore;
        }
        if (alternatives.length() == 0 && bestUci != null) {
            JSONObject option = new JSONObject();
            option.put("uci", bestUci);
            option.put("score", 0);
            option.put("pv", new JSONArray().put(bestUci));
            alternatives.put(option);
        }
        JSONObject response = new JSONObject();
        response.put("score", whiteScore);
        response.put("lines", alternatives);
        return response;
    }

    private synchronized void resetEngine() {
        if (engine != null) { engine.destroy(); engine = null; }
        reader = null;
        writer = null;
    }
    @Override protected void onDestroy() {
        activeReviewId.set(-1);
        worker.shutdownNow();
        resetEngine();
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}

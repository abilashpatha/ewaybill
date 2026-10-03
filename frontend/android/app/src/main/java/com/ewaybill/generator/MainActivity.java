package com.ewaybill.generator;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends BridgeActivity {

    private static final int PERM_STORAGE = 201;
    private static final int PERM_NOTIFY  = 202;
    private static final String CHANNEL_ID = "ewb_downloads";
    private static final AtomicInteger NOTIF_ID = new AtomicInteger(1000);

    // Held while waiting for storage permission on Android < 10
    private String pendingBase64   = null;
    private String pendingFilename = null;
    private String pendingMime     = null;

    // ── JavaScript Bridge ─────────────────────────────────────────────────────
    class AndroidBridge {

        /** Share PDF via Android share sheet */
        @JavascriptInterface
        public void sharePdf(String base64, String filename) {
            new Thread(() -> {
                try {
                    File file = writeToCacheDir(base64, filename);
                    Uri uri   = FileProvider.getUriForFile(
                        MainActivity.this, getPackageName() + ".fileprovider", file);

                    Intent intent = new Intent(Intent.ACTION_SEND);
                    intent.setType("application/pdf");
                    intent.putExtra(Intent.EXTRA_STREAM, uri);
                    intent.putExtra(Intent.EXTRA_SUBJECT, filename);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    runOnUiThread(() -> startActivity(
                        Intent.createChooser(intent, "Share via")));
                } catch (Exception e) {
                    showToast("Share failed: " + e.getMessage());
                }
            }).start();
        }

        /** Open PDF in installed viewer (no save to Downloads) */
        @JavascriptInterface
        public void openPdf(String base64, String filename) {
            new Thread(() -> {
                try {
                    File file = writeToCacheDir(base64, filename);
                    Uri uri   = FileProvider.getUriForFile(
                        MainActivity.this, getPackageName() + ".fileprovider", file);

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setDataAndType(uri, "application/pdf");
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    runOnUiThread(() -> {
                        if (intent.resolveActivity(getPackageManager()) != null) {
                            startActivity(intent);
                        } else {
                            showToast("No PDF viewer installed");
                        }
                    });
                } catch (Exception e) {
                    showToast("Open failed: " + e.getMessage());
                }
            }).start();
        }

        /**
         * Save any file to the Downloads folder and show a tap-to-open notification.
         * Called from JS:  window.Android.downloadFile(base64, filename, mimeType)
         */
        @JavascriptInterface
        public void downloadFile(String base64, String filename, String mimeType) {
            if (mimeType == null || mimeType.isEmpty()) mimeType = "application/pdf";

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(MainActivity.this,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                // Save args and request permission; saving resumes in onRequestPermissionsResult
                pendingBase64   = base64;
                pendingFilename = filename;
                pendingMime     = mimeType;
                ActivityCompat.requestPermissions(MainActivity.this,
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERM_STORAGE);
                return;
            }
            saveFileToDownloads(base64, filename, mimeType);
        }

        private File writeToCacheDir(String base64, String filename) throws Exception {
            byte[] bytes   = Base64.decode(base64, Base64.DEFAULT);
            File cacheDir  = new File(getCacheDir(), "pdfs");
            if (!cacheDir.exists()) cacheDir.mkdirs();
            File file = new File(cacheDir, filename);
            try (FileOutputStream fos = new FileOutputStream(file)) { fos.write(bytes); }
            return file;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    @Override
    public void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        super.onCreate(savedInstanceState);

        createNotificationChannel();

        // Request notification permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERM_NOTIFY);
            }
        }

        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        // Fallback DownloadListener for data-URI clicks that bypass the bridge
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("data:")) {
                String base64 = url.substring(url.indexOf(",") + 1);
                String fname  = "Download_" + System.currentTimeMillis() + ".pdf";
                String mime   = (mimeType != null && !mimeType.isEmpty()) ? mimeType : "application/pdf";
                saveFileToDownloads(base64, fname, mime);
            }
        });
    }

    // ── Save to Downloads + notification ─────────────────────────────────────

    private void saveFileToDownloads(String base64, String filename, String mimeType) {
        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                Uri openUri;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    // Android 10+ — no storage permission needed
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                    values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                    values.put(MediaStore.Downloads.IS_PENDING, 1);

                    openUri = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);

                    if (openUri == null) { showToast("Download failed"); return; }

                    try (OutputStream os = getContentResolver().openOutputStream(openUri)) {
                        if (os != null) os.write(bytes);
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    getContentResolver().update(openUri, values, null, null);

                } else {
                    // Android 9 and below
                    File dir  = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                    File file = new File(dir, filename);
                    try (FileOutputStream fos = new FileOutputStream(file)) { fos.write(bytes); }
                    android.media.MediaScannerConnection.scanFile(this,
                        new String[]{file.getAbsolutePath()},
                        new String[]{mimeType}, null);
                    openUri = FileProvider.getUriForFile(
                        this, getPackageName() + ".fileprovider", file);
                }

                showDownloadNotification(filename, openUri, mimeType);

            } catch (Exception e) {
                showToast("Download failed: " + e.getMessage());
            }
        }).start();
    }

    private void showDownloadNotification(String fileName, Uri fileUri, String mimeType) {
        Intent openIntent = new Intent(Intent.ACTION_VIEW);
        openIntent.setDataAndType(fileUri, mimeType);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

        PendingIntent pendingIntent = PendingIntent.getActivity(this, NOTIF_ID.get(),
            openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Downloaded: " + fileName)
            .setContentText("Tap to open")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID.getAndIncrement(), builder.build());

        showToast("Saved to Downloads: " + fileName);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Downloads", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("File download notifications");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private void showToast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
            @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERM_STORAGE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingBase64 != null) {
                    saveFileToDownloads(pendingBase64, pendingFilename, pendingMime);
                    pendingBase64 = pendingFilename = pendingMime = null;
                }
            } else {
                showToast("Storage permission denied — cannot save file");
            }
        }
    }
}

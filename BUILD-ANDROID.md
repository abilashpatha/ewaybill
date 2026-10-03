# Build Android APK — Step by Step

## Prerequisites (one-time setup)
1. Install **Android Studio**: https://developer.android.com/studio
2. During install, make sure "Android SDK" is checked

## Step 1 — Install Capacitor packages
Open PowerShell in the frontend folder:
```
cd "C:\Users\hp\OneDrive\Documents\Ewaybill\frontend"
npm install
npx cap init "E-Waybill Generator" "com.ewaybill.generator" --web-dir dist
```

## Step 2 — Add Android platform
```
npm run build
npx cap add android
npx cap sync android
```

## Step 3 — Copy network security config
After `cap add android`, run:
```
copy android-resources\network_security_config.xml android\app\src\main\res\xml\network_security_config.xml
```
Then open `android\app\src\main\AndroidManifest.xml` and add inside `<application ...>`:
```
android:networkSecurityConfig="@xml/network_security_config"
```

## Step 4 — Build APK in Android Studio
```
npx cap open android
```
In Android Studio:
- Wait for Gradle sync to finish
- Menu: Build → Build Bundle(s)/APK(s) → Build APK(s)
- APK saved at: `android\app\build\outputs\apk\debug\app-debug.apk`

## Install on Phone
- Enable "Install unknown apps" on Android phone
- Transfer APK via USB or WhatsApp
- Tap to install

## How updates work
- Deploy changes to VPS → both web AND mobile app update automatically
- No need to rebuild APK for content changes
- Only rebuild APK if you change app name, icon, or Capacitor config

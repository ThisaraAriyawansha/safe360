# Safe360 — Home Security Monitor
### PIR Sensor Dashboard with Firebase Push Notifications

---

## 📁 Project Structure
```
safe360/
├── app/
│   ├── layout.js          ← fonts, metadata
│   ├── page.js            ← main dashboard
│   ├── page.module.css    ← all styles
│   └── globals.css        ← design tokens & animations
├── lib/
│   └── firebase.js        ← Firebase config (edit this!)
├── public/
│   ├── firebase-messaging-sw.js  ← service worker (edit this!)
│   └── manifest.json      ← PWA manifest
└── package.json
```

---

## 🔥 STEP-BY-STEP FIREBASE SETUP

### STEP 1 — Create Firebase Project
1. Go to → https://console.firebase.google.com
2. Click **"Add project"**
3. Name it: **safe360**
4. Disable Google Analytics (not needed)
5. Click **"Create project"**

---

### STEP 2 — Enable Realtime Database
1. In Firebase Console left menu → **"Build"** → **"Realtime Database"**
2. Click **"Create Database"**
3. Choose location: **Asia (asia-southeast1)** (closest to Sri Lanka)
4. Select **"Start in test mode"** (for now)
5. Click **"Enable"**

Your database URL will look like:
```
https://safe360-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app
```

#### Set Database Rules (for security):
In Realtime Database → **Rules** tab, paste this:
```json
{
  "rules": {
    "safe360": {
      ".read": true,
      ".write": true
    }
  }
}
```
Click **Publish**

---

### STEP 3 — Set Up Database Structure
In Realtime Database → **Data** tab, click the **+** icon and create this structure manually:

```
safe360/
  sensors/
    invertor_side/
      motion: false
      lastSeen: 0
    front_side/
      motion: false
      lastSeen: 0
    water_supply_side/
      motion: false
      lastSeen: 0
```

---

### STEP 4 — Register Web App & Get Config
1. In Firebase Console → **Project Overview** → click **"</>""** (Web) icon
2. App nickname: **safe360-web**
3. ✅ Check **"Also set up Firebase Hosting"** (optional)
4. Click **"Register app"**
5. You will see your config — **COPY IT**, it looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "safe360-xxxxx.firebaseapp.com",
  databaseURL: "https://safe360-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "safe360-xxxxx",
  storageBucket: "safe360-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

---

### STEP 5 — Enable Firebase Cloud Messaging (FCM)
1. Firebase Console → **Project Settings** (gear icon ⚙️)
2. Go to **"Cloud Messaging"** tab
3. Under **"Web configuration"** → click **"Generate key pair"**
4. Copy the **VAPID Key** (long string starting with "BG...")
5. Save it — you will need it!

---

### STEP 6 — Update Your Code

#### Edit `lib/firebase.js`:
Replace ALL the placeholder values:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "safe360-xxxxx.firebaseapp.com",
  databaseURL: "https://safe360-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "safe360-xxxxx",
  storageBucket: "safe360-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
  vapidKey: "BG....your vapid key here"
};
```

#### Edit `public/firebase-messaging-sw.js`:
Replace config values here too (same values, no vapidKey needed here):
```javascript
firebase.initializeApp({
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "safe360-xxxxx.firebaseapp.com",
  databaseURL: "https://...",
  projectId: "safe360-xxxxx",
  storageBucket: "safe360-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
});
```

---

### STEP 7 — Set Up Firebase Cloud Functions (for server-side notifications)

> This sends notifications to ALL devices when motion is detected.

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
firebase login
firebase init functions
```

2. Choose: **JavaScript**, **Yes to ESLint**, **Yes to install dependencies**

3. Edit `functions/index.js`:
```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.motionAlert = functions.database
  .ref("/safe360/sensors/{sensorId}/motion")
  .onWrite(async (change, context) => {
    const motion = change.after.val();
    if (!motion) return null;

    const sensorId = context.params.sensorId;
    const labels = {
      invertor_side:      "Invertor Side",
      front_side:         "Front Side",
      water_supply_side:  "Water Supply Side"
    };
    const label = labels[sensorId] || sensorId;

    const message = {
      notification: {
        title: "🚨 Safe360 Alert",
        body: `Motion detected at ${label}!`
      },
      topic: "safe360-alerts"
    };

    return admin.messaging().send(message);
  });
```

4. Deploy:
```bash
firebase deploy --only functions
```

---

### STEP 8 — Subscribe Phone to Notifications Topic

In your `lib/firebase.js`, after getting the token, add topic subscription via your server or Cloud Function. For testing, you can use the FCM REST API:

```bash
curl -X POST \
  https://iid.googleapis.com/iid/v1/YOUR_FCM_TOKEN/rel/topics/safe360-alerts \
  -H "Authorization: key=YOUR_SERVER_KEY"
```

Find your **Server Key** in: Firebase Console → Project Settings → Cloud Messaging → **Server key**

---

## 🚀 Running the App

```bash
# 1. Install dependencies
cd safe360
npm install

# 2. Start development server
npm run dev

# 3. Open browser
# Go to: http://localhost:3000
```

---

## 📱 Testing Without Hardware

The dashboard has a **"Simulate Motion"** button on each sensor card.

Click it → sensor shows "MOTION" alert → database updates → notification fires!

**Remove these buttons** when you connect the real ESP32.

---

## 🔌 ESP32 Connection (Later)

When you build hardware, your ESP32 Arduino code will do this:

```cpp
#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// When PIR triggers:
Firebase.RTDB.setBool(&fbdo, "/safe360/sensors/front_side/motion", true);
Firebase.RTDB.setInt(&fbdo, "/safe360/sensors/front_side/lastSeen", millis());
```

---

## ✅ Checklist

- [ ] Firebase project created
- [ ] Realtime Database enabled
- [ ] Database structure created
- [ ] Web app registered
- [ ] Config copied to `lib/firebase.js`
- [ ] Config copied to `public/firebase-messaging-sw.js`
- [ ] VAPID key added
- [ ] `npm install` done
- [ ] `npm run dev` running
- [ ] "Enable Notifications" clicked on phone
- [ ] "Simulate Motion" tested

---

## 🌐 Deploy to Production

```bash
npm run build
npm run start
# OR deploy to Vercel (free):
npx vercel
```

---

**Safe360** — Built with Next.js + Firebase

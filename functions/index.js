const functions = require("firebase-functions");
const admin     = require("firebase-admin");

admin.initializeApp();

const SENSOR_LABELS = {
  invertor_side:     "Invertor Side",
  front_side:        "Front Side",
  water_supply_side: "Water Supply",
};

// Fires whenever safe360/sensors/{sensorId}/motion is written
exports.notifyMotion = functions
  .region("asia-southeast1")
  .database.ref("safe360/sensors/{sensorId}/motion")
  .onWrite(async (change, context) => {
    const motion = change.after.val();
    if (!motion) return null; // only act when motion becomes true

    const sensorId = context.params.sensorId;
    const label    = SENSOR_LABELS[sensorId] || sensorId;

    // Read all registered FCM tokens
    const tokensSnap = await admin.database().ref("safe360/tokens").once("value");
    if (!tokensSnap.exists()) return null;

    const tokens = Object.values(tokensSnap.val())
      .map(t => t.token)
      .filter(Boolean);
    if (tokens.length === 0) return null;

    // Send to every registered device
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "Safe360 Alert",
        body:  `Motion detected at ${label}!`,
      },
      data: { sensorId, label },
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "safe360_alerts" },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
      webpush: {
        notification: {
          icon:    "/icon-192.png",
          badge:   "/icon-192.png",
          vibrate: [200, 100, 200],
          tag:     "safe360-alert",
          renotify: true,
        },
        fcmOptions: { link: "/" },
      },
    });

    // Remove tokens that are no longer valid
    const staleKeys = [];
    response.responses.forEach((r, i) => {
      if (
        !r.success &&
        (r.error?.code === "messaging/registration-token-not-registered" ||
         r.error?.code === "messaging/invalid-registration-token")
      ) {
        staleKeys.push(tokens[i].slice(-16));
      }
    });
    if (staleKeys.length > 0) {
      await Promise.all(
        staleKeys.map(k => admin.database().ref(`safe360/tokens/${k}`).remove())
      );
    }

    console.log(
      `[notifyMotion] ${label}: sent ${response.successCount}/${tokens.length}, ` +
      `removed ${staleKeys.length} stale token(s)`
    );
    return null;
  });

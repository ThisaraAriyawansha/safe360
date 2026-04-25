import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getDatabase }  from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

const SENSOR_LABELS = {
  invertor_side:     "Invertor Side",
  front_side:        "Front Side",
  water_supply_side: "Water Supply",
};

function initAdmin() {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sensor, secret } = body;

  // Reject requests without the correct shared secret
  if (!secret || secret !== process.env.NOTIFY_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sensor) {
    return NextResponse.json({ error: "Missing sensor" }, { status: 400 });
  }

  try {
    initAdmin();

    const db = getDatabase();
    const tokensSnap = await db.ref("safe360/tokens").get();

    if (!tokensSnap.exists()) {
      return NextResponse.json({ sent: 0, total: 0 });
    }

    const tokens = Object.values(tokensSnap.val())
      .map(t => t.token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0, total: 0 });
    }

    const label = SENSOR_LABELS[sensor] || sensor;

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "Safe360 Alert",
        body:  `Motion detected at ${label}!`,
      },
      data: { sensorId: sensor, label },
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "safe360_alerts" },
      },
      apns: {
        payload: { aps: { sound: "default", badge: 1 } },
      },
      webpush: {
        notification: {
          icon:     "/icon-192.png",
          badge:    "/icon-192.png",
          vibrate:  [200, 100, 200],
          tag:      "safe360-alert",
          renotify: true,
        },
        fcmOptions: { link: "/" },
      },
    });

    // Remove tokens that FCM says are no longer valid
    const staleKeys = response.responses
      .map((r, i) =>
        !r.success &&
        (r.error?.code === "messaging/registration-token-not-registered" ||
         r.error?.code === "messaging/invalid-registration-token")
          ? tokens[i].slice(-16)
          : null
      )
      .filter(Boolean);

    if (staleKeys.length > 0) {
      await Promise.all(
        staleKeys.map(k => db.ref(`safe360/tokens/${k}`).remove())
      );
    }

    console.log(
      `[notify] ${label}: ${response.successCount}/${tokens.length} sent, ` +
      `${staleKeys.length} stale removed`
    );

    return NextResponse.json({
      sent:  response.successCount,
      total: tokens.length,
    });
  } catch (err) {
    console.error("[notify] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

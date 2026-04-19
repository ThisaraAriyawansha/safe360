// app/page.js
"use client";
import { useEffect, useState, useCallback } from "react";
import { database, getFirebaseMessaging, firebaseConfig } from "../lib/firebase";
import { ref, onValue, set } from "firebase/database";
import { getToken, onMessage } from "firebase/messaging";
import styles from "./page.module.css";

const SENSORS = [
  {
    id: "invertor_side",
    label: "Invertor Side",
    icon: "⚡",
    description: "Power unit area",
  },
  {
    id: "front_side",
    label: "Front Side",
    icon: "🚪",
    description: "Main entrance",
  },
  {
    id: "water_supply_side",
    label: "Water Supply",
    icon: "💧",
    description: "Water tank area",
  },
];

export default function Home() {
  const [sensorData, setSensorData] = useState({
    invertor_side:      { motion: false, lastSeen: null },
    front_side:         { motion: false, lastSeen: null },
    water_supply_side:  { motion: false, lastSeen: null },
  });
  const [notifStatus, setNotifStatus] = useState("idle"); // idle | requesting | granted | denied
  const [fcmToken, setFcmToken]       = useState(null);
  const [alerts, setAlerts]           = useState([]);
  const [connected, setConnected]     = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Listen to Firebase Realtime Database
  useEffect(() => {
    const sensorsRef = ref(database, "safe360/sensors");
    const unsub = onValue(
      sensorsRef,
      (snapshot) => {
        setConnected(true);
        if (snapshot.exists()) {
          const data = snapshot.val();
          setSensorData((prev) => {
            const next = { ...prev };
            Object.keys(data).forEach((key) => {
              if (next[key] !== undefined) {
                const wasMotion = prev[key]?.motion;
                const isMotion  = data[key]?.motion;
                next[key] = data[key];
                // Add alert if new motion detected
                if (!wasMotion && isMotion) {
                  const sensor = SENSORS.find((s) => s.id === key);
                  addAlert(`Motion detected at ${sensor?.label || key}!`, "alert");
                }
              }
            });
            return next;
          });
        }
      },
      (error) => {
        setConnected(false);
        console.error("Firebase error:", error);
      }
    );
    return () => unsub();
  }, []);

  const addAlert = useCallback((message, type = "info") => {
    const id = Date.now();
    setAlerts((prev) => [{ id, message, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
    // Auto remove after 8s
    setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), 8000);
  }, []);

  // Request notification permission & get FCM token
  const requestNotifications = async () => {
    setNotifStatus("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifStatus("denied");
        return;
      }
      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        setNotifStatus("denied");
        return;
      }
      const token = await getToken(messaging, { vapidKey: firebaseConfig.vapidKey });
      setFcmToken(token);
      setNotifStatus("granted");

      // Listen for foreground messages
      onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};
        addAlert(body || title || "Motion detected!", "alert");
        if (Notification.permission === "granted") {
          new Notification(title || "Safe360 Alert", {
            body: body || "Motion detected!",
            icon: "/icon-192.png",
          });
        }
      });
    } catch (err) {
      console.error(err);
      setNotifStatus("denied");
    }
  };

  // Simulate motion for testing (no hardware yet)
  const simulateMotion = async (sensorId) => {
    try {
      await set(ref(database, `safe360/sensors/${sensorId}`), {
        motion: true,
        lastSeen: Date.now(),
      });
      setTimeout(async () => {
        await set(ref(database, `safe360/sensors/${sensorId}/motion`), false);
      }, 4000);
    } catch (err) {
      addAlert("Could not write to Firebase. Check your config.", "warn");
    }
  };

  const activeCount = Object.values(sensorData).filter((s) => s.motion).length;

  return (
    <div className={styles.page}>
      {/* Background mesh */}
      <div className={styles.bgMesh} aria-hidden />

      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <span>S</span>
            </div>
            <h1 className={styles.brandName}>Safe360</h1>
          </div>

          <div className={styles.headerRight}>
            <div className={`${styles.connDot} ${connected ? styles.connDotOn : styles.connDotOff}`} />
            <span className={styles.connLabel}>{connected ? "Live" : "Offline"}</span>
            <div className={styles.clock}>{currentTime}</div>
          </div>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── HERO STATUS ── */}
        <section className={styles.heroSection}>
          <p className={styles.heroSub}>Home Security Monitor</p>
          <h2 className={styles.heroTitle}>
            {activeCount === 0 ? "All Clear" : `${activeCount} Alert${activeCount > 1 ? "s" : ""} Active`}
          </h2>
          <div className={`${styles.heroStatus} ${activeCount > 0 ? styles.heroStatusAlert : styles.heroStatusSafe}`}>
            <div className={styles.pulseRing} />
            <span className={styles.heroStatusDot} />
            <span>{activeCount === 0 ? "No motion detected" : "Motion in progress"}</span>
          </div>
        </section>

        {/* ── SENSOR CARDS ── */}
        <section className={styles.sensorsSection}>
          <h3 className={styles.sectionTitle}>Sensor Zones</h3>
          <div className={styles.sensorGrid}>
            {SENSORS.map((sensor) => {
              const data    = sensorData[sensor.id];
              const isAlert = data?.motion;
              const lastSeen = data?.lastSeen
                ? new Date(data.lastSeen).toLocaleTimeString()
                : "—";

              return (
                <div
                  key={sensor.id}
                  className={`${styles.sensorCard} ${isAlert ? styles.sensorCardAlert : styles.sensorCardSafe}`}
                >
                  <div className={styles.sensorTop}>
                    <div className={`${styles.sensorIconWrap} ${isAlert ? styles.sensorIconAlert : ""}`}>
                      <span className={styles.sensorIcon}>{sensor.icon}</span>
                    </div>
                    <div className={`${styles.sensorBadge} ${isAlert ? styles.badgeAlert : styles.badgeSafe}`}>
                      {isAlert ? "MOTION" : "CLEAR"}
                    </div>
                  </div>

                  <h4 className={styles.sensorName}>{sensor.label}</h4>
                  <p className={styles.sensorDesc}>{sensor.description}</p>

                  <div className={styles.sensorMeta}>
                    <span className={styles.sensorMetaLabel}>Last activity</span>
                    <span className={styles.sensorMetaVal}>{lastSeen}</span>
                  </div>

                  {/* Test button — remove when hardware is ready */}
                  <button
                    className={styles.testBtn}
                    onClick={() => simulateMotion(sensor.id)}
                  >
                    Simulate Motion
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── NOTIFICATIONS ── */}
        <section className={styles.notifSection}>
          <h3 className={styles.sectionTitle}>Push Notifications</h3>
          <div className={styles.notifCard}>
            <div className={styles.notifInfo}>
              <div className={styles.notifIconWrap}>🔔</div>
              <div>
                <p className={styles.notifTitle}>Get alerted instantly</p>
                <p className={styles.notifDesc}>
                  Receive push notifications on this device when motion is detected — even when the app is closed.
                </p>
              </div>
            </div>

            {notifStatus === "idle" && (
              <button className={styles.notifBtn} onClick={requestNotifications}>
                Enable Notifications
              </button>
            )}
            {notifStatus === "requesting" && (
              <button className={styles.notifBtn} disabled>Requesting…</button>
            )}
            {notifStatus === "granted" && (
              <div className={styles.notifGranted}>
                <span className={styles.notifGrantedDot} /> Notifications Active
              </div>
            )}
            {notifStatus === "denied" && (
              <p className={styles.notifDenied}>
                Permission denied. Enable notifications in your browser settings.
              </p>
            )}

            {fcmToken && (
              <div className={styles.tokenBox}>
                <p className={styles.tokenLabel}>FCM Device Token (save this for ESP32):</p>
                <code className={styles.tokenCode}>{fcmToken}</code>
              </div>
            )}
          </div>
        </section>

        {/* ── ALERT LOG ── */}
        <section className={styles.alertSection}>
          <h3 className={styles.sectionTitle}>Activity Log</h3>
          <div className={styles.alertList}>
            {alerts.length === 0 ? (
              <div className={styles.alertEmpty}>
                <span>No recent activity</span>
              </div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={`${styles.alertItem} ${styles[`alertItem_${a.type}`]}`}>
                  <span className={styles.alertDot} />
                  <div>
                    <p className={styles.alertMsg}>{a.message}</p>
                    <p className={styles.alertTime}>{a.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <p>Safe360 &copy; {new Date().getFullYear()} &mdash; Home Security System</p>
      </footer>
    </div>
  );
}

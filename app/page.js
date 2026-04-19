// app/page.js
"use client";
import { useEffect, useState, useCallback } from "react";
import { database, getFirebaseMessaging, firebaseConfig, configured } from "../lib/firebase";
import { ref, onValue, set, push, query, orderByChild, startAt, remove, get } from "firebase/database";
import { getToken, onMessage } from "firebase/messaging";
import styles from "./page.module.css";

const SENSORS = [
  { id: "invertor_side",    label: "Invertor Side",  icon: "⚡", description: "Power unit area"  },
  { id: "front_side",       label: "Front Side",     icon: "🚪", description: "Main entrance"    },
  { id: "water_supply_side",label: "Water Supply",   icon: "💧", description: "Water tank area"  },
];

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function formatDateTime(ts) {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export default function Home() {
  const [sensorData, setSensorData] = useState({
    invertor_side:       { motion: false, lastSeen: null },
    front_side:          { motion: false, lastSeen: null },
    water_supply_side:   { motion: false, lastSeen: null },
  });
  const [notifStatus, setNotifStatus] = useState("idle");
  const [fcmToken, setFcmToken]       = useState(null);
  const [alerts, setAlerts]           = useState([]);          // live toast alerts
  const [history, setHistory]         = useState([]);          // persisted DB history
  const [connected, setConnected]     = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      setCurrentTime(new Date().toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Purge + load alert history from Firebase ───────────────────────────────
  useEffect(() => {
    const cutoff   = Date.now() - ONE_MONTH_MS;
    const alertsRef = ref(database, "safe360/alerts");

    // 1. Delete entries older than 30 days (one-time on load)
    const purgeOld = async () => {
      const snap = await get(alertsRef);
      if (!snap.exists()) return;
      snap.forEach((child) => {
        if ((child.val().timestamp || 0) < cutoff) {
          remove(child.ref);
        }
      });
    };
    purgeOld();

    // 2. Live-listen to last 30 days of history
    const recentQ  = query(alertsRef, orderByChild("timestamp"), startAt(cutoff));
    const unsub = onValue(recentQ, (snapshot) => {
      if (!snapshot.exists()) { setHistory([]); return; }
      const items = [];
      snapshot.forEach((child) => {
        items.push({ key: child.key, ...child.val() });
      });
      // newest first
      items.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(items);
    });

    return () => unsub();
  }, []);

  // ── Listen to sensor state ─────────────────────────────────────────────────
  useEffect(() => {
    const sensorsRef = ref(database, "safe360/sensors");
    const unsub = onValue(
      sensorsRef,
      (snapshot) => {
        setConnected(true);
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        setSensorData((prev) => {
          const next = { ...prev };
          Object.keys(data).forEach((key) => {
            if (next[key] === undefined) return;
            const wasMotion = prev[key]?.motion;
            const isMotion  = data[key]?.motion;
            next[key] = data[key];
            if (!wasMotion && isMotion) {
              const sensor = SENSORS.find((s) => s.id === key);
              saveAndToast(`Motion detected at ${sensor?.label || key}!`, "alert", key);
            }
          });
          return next;
        });
      },
      (error) => {
        setConnected(false);
        console.error("Firebase error:", error);
      }
    );
    return () => unsub();
  }, []);

  // ── Save alert to Firebase + show toast ───────────────────────────────────
  const saveAndToast = useCallback((message, type = "info", sensorId = null) => {
    const now = Date.now();
    const { date, time } = formatDateTime(now);

    // Persist to Firebase
    push(ref(database, "safe360/alerts"), { message, type, sensorId, timestamp: now, date, time })
      .catch((err) => console.error("Alert save failed:", err));

    // Toast (auto-dismiss after 8 s)
    const toastId = now + Math.random();
    setAlerts((prev) => [{ id: toastId, message, type, date, time }, ...prev.slice(0, 9)]);
    setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== toastId)), 8000);
  }, []);

  // ── FCM / push notifications ───────────────────────────────────────────────
  const requestNotifications = async () => {
    setNotifStatus("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setNotifStatus("denied"); return; }
      const messaging = await getFirebaseMessaging();
      if (!messaging)               { setNotifStatus("denied"); return; }
      const token = await getToken(messaging, { vapidKey: firebaseConfig.vapidKey });
      setFcmToken(token);
      setNotifStatus("granted");
      onMessage(messaging, (payload) => {
        const { title, body } = payload.notification || {};
        saveAndToast(body || title || "Motion detected!", "alert");
        if (Notification.permission === "granted") {
          new Notification(title || "Safe360 Alert", { body: body || "Motion detected!", icon: "/icon-192.png" });
        }
      });
    } catch (err) {
      console.error(err);
      setNotifStatus("denied");
    }
  };

  // ── Simulate motion (testing only) ────────────────────────────────────────
  const simulateMotion = async (sensorId) => {
    try {
      await set(ref(database, `safe360/sensors/${sensorId}`), { motion: true, lastSeen: Date.now() });
      setTimeout(() => set(ref(database, `safe360/sensors/${sensorId}/motion`), false), 4000);
    } catch {
      saveAndToast("Could not write to Firebase. Check your config.", "warn");
    }
  };

  const activeCount = Object.values(sensorData).filter((s) => s.motion).length;

  return (
    <div className={styles.page}>
      <div className={styles.bgMesh} aria-hidden />

      {/* ── HEADER ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}><span>S</span></div>
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

        {/* ── HERO ── */}
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
              const data     = sensorData[sensor.id];
              const isAlert  = data?.motion;
              const lastSeen = data?.lastSeen ? new Date(data.lastSeen).toLocaleTimeString() : "—";
              return (
                <div key={sensor.id} className={`${styles.sensorCard} ${isAlert ? styles.sensorCardAlert : styles.sensorCardSafe}`}>
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
                  <button className={styles.testBtn} onClick={() => simulateMotion(sensor.id)}>
                    Simulate Motion
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── PUSH NOTIFICATIONS ── */}
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
            {notifStatus === "idle"       && <button className={styles.notifBtn} onClick={requestNotifications}>Enable Notifications</button>}
            {notifStatus === "requesting" && <button className={styles.notifBtn} disabled>Requesting…</button>}
            {notifStatus === "granted"    && <div className={styles.notifGranted}><span className={styles.notifGrantedDot} /> Notifications Active</div>}
            {notifStatus === "denied"     && <p className={styles.notifDenied}>Permission denied. Enable notifications in your browser settings.</p>}
            {fcmToken && (
              <div className={styles.tokenBox}>
                <p className={styles.tokenLabel}>FCM Device Token (save this for ESP32):</p>
                <code className={styles.tokenCode}>{fcmToken}</code>
              </div>
            )}
          </div>
        </section>

        {/* ── LIVE TOAST ALERTS ── */}
        {alerts.length > 0 && (
          <div className={styles.toastList}>
            {alerts.map((a) => (
              <div key={a.id} className={`${styles.toast} ${styles[`toast_${a.type}`]}`}>
                <span className={styles.toastDot} />
                <div>
                  <p className={styles.toastMsg}>{a.message}</p>
                  <p className={styles.toastTime}>{a.date} — {a.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ALERT HISTORY (persisted, last 30 days) ── */}
        <section className={styles.historySection}>
          <div className={styles.historyHeader}>
            <h3 className={styles.sectionTitle}>Alert History</h3>
            <span className={styles.historyBadge}>{history.length} events · last 30 days</span>
          </div>

          {history.length === 0 ? (
            <div className={styles.historyEmpty}>
              <span className={styles.historyEmptyIcon}>📋</span>
              <p>No alerts recorded yet</p>
            </div>
          ) : (
            <div className={styles.historyList}>
              {history.map((item) => {
                const sensor = SENSORS.find((s) => s.id === item.sensorId);
                return (
                  <div key={item.key} className={`${styles.historyItem} ${styles[`historyItem_${item.type}`]}`}>
                    <div className={styles.historyItemLeft}>
                      <span className={styles.historyDot} />
                      <span className={styles.historyIcon}>{sensor?.icon || "🔔"}</span>
                    </div>
                    <div className={styles.historyBody}>
                      <p className={styles.historyMsg}>{item.message}</p>
                      <p className={styles.historyMeta}>
                        <span className={styles.historyDate}>{item.date}</span>
                        <span className={styles.historySep}>·</span>
                        <span className={styles.historyTime}>{item.time}</span>
                        {sensor && <><span className={styles.historySep}>·</span><span className={styles.historyZone}>{sensor.label}</span></>}
                      </p>
                    </div>
                    <div className={`${styles.historyTypeBadge} ${styles[`historyBadge_${item.type}`]}`}>
                      {item.type === "alert" ? "MOTION" : item.type.toUpperCase()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className={styles.footer}>
        <p>Safe360 &copy; {new Date().getFullYear()} &mdash; Home Security System</p>
      </footer>
    </div>
  );
}

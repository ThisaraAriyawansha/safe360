import { NextResponse } from "next/server";
import { sendPush } from "../../../lib/send-push";

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { sensor } = body;
  if (!sensor)
    return NextResponse.json({ error: "Missing sensor" }, { status: 400 });

  try {
    const result = await sendPush(sensor);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[notify-sim] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

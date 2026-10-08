"use client";

import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { answerCall, hangUp, rejectCall, startCall } from "@/app/dashboard/actions/calls";
import { cn } from "@/lib/cn";
import { formatPhone } from "@/lib/phone";

type Ringing = { id: string; fromPhone: string; callerName: string | null; offerSdp: string; customer: { name: string } | null };
/** since is null while an outgoing call is still ringing on the customer's phone. */
type Live = { id: string; who: string; since: number | null };

/** Fired by a "Call" button anywhere in the dashboard; the widget does the dialling. */
export const CALL_EVENT = "wa-call";
export type CallRequest = { customerId: string; name: string };
export function placeCall(r: CallRequest) {
  window.dispatchEvent(new CustomEvent<CallRequest>(CALL_EVENT, { detail: r }));
}

const ENDED_BEFORE_ANSWER: Record<string, string> = { MISSED: "No answer.", REJECTED: "The customer declined the call." };

const POLL_MS = 2000;

/** Waits until the browser has gathered its network candidates, so they go out inside the SDP answer. */
function iceGathered(pc: RTCPeerConnection, timeoutMs = 3000) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => pc.iceGatheringState === "complete" && resolve();
    pc.addEventListener("icegatheringstatechange", done);
    setTimeout(resolve, timeoutMs);
  });
}

/** A two-tone ring made with Web Audio, so no sound file is needed. */
function startRinging() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => {};
  const ctx = new AC();
  const beep = () => {
    for (const [freq, at] of [[440, 0], [480, 0], [440, 0.5], [480, 0.5]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.08;
      o.frequency.value = freq;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.4);
    }
  };
  beep();
  const t = setInterval(beep, 2500);
  return () => {
    clearInterval(t);
    ctx.close();
  };
}

const who = (c: Ringing) => c.customer?.name || c.callerName || formatPhone(c.fromPhone);

/** Rings in any open dashboard tab when a customer calls on WhatsApp, and runs the call in the browser. */
export function CallWidget() {
  const [ringing, setRinging] = useState<Ringing[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const answerApplied = useRef(false);

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    answerApplied.current = false;
    setLive(null);
    setMuted(false);
  }, []);

  // Poll for ringing calls; while on a call, poll that call instead to notice the caller hanging up.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        if (live) {
          const r = await fetch(`/api/calls?active=${live.id}`, { cache: "no-store" });
          if (!r.ok || stop) return;
          const { status, answerSdp } = (await r.json()) as { status: string; answerSdp: string | null };
          // Outgoing: the customer picked up, so finish the connection with their answer.
          if (answerSdp && !answerApplied.current && pc.current) {
            answerApplied.current = true;
            await pc.current.setRemoteDescription({ type: "answer", sdp: answerSdp });
            setLive((l) => (l ? { ...l, since: Date.now() } : l));
          }
          if (status !== "ANSWERED" && status !== "RINGING") {
            if (!answerApplied.current && live.since === null && ENDED_BEFORE_ANSWER[status]) setError(ENDED_BEFORE_ANSWER[status]);
            cleanup();
          }
        } else {
          const r = await fetch("/api/calls", { cache: "no-store" });
          if (r.ok && !stop) setRinging((await r.json()).calls);
        }
      } catch {
        // offline for a moment; try again next tick
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, cleanup]);

  const incoming = live ? null : ringing[0];
  useEffect(() => (incoming ? startRinging() : undefined), [incoming?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const newConnection = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.current = stream;
    const conn = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.current = conn;
    stream.getTracks().forEach((t) => conn.addTrack(t, stream));
    conn.ontrack = (e) => {
      if (audio.current) audio.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
    };
    conn.onconnectionstatechange = () => {
      if (conn.connectionState === "failed") setError("The audio connection dropped.");
    };
    return conn;
  }, []);

  const micError = (e: unknown, fallback: string) =>
    e instanceof DOMException && e.name === "NotAllowedError" ? "Allow microphone access in your browser to make and answer calls." : fallback;

  // Dial out when a "Call" button asks to.
  useEffect(() => {
    const onCall = async (e: Event) => {
      const { customerId, name } = (e as CustomEvent<CallRequest>).detail;
      if (pc.current) return setError("Finish the current call first.");
      setBusy(true);
      setError(null);
      try {
        const conn = await newConnection();
        await conn.setLocalDescription(await conn.createOffer());
        await iceGathered(conn);
        const res = await startCall(customerId, conn.localDescription!.sdp);
        if (!res.ok || !res.id) {
          cleanup();
          setError(res.message ?? "Could not place the call.");
        } else {
          setLive({ id: res.id, who: name, since: null });
        }
      } catch (err) {
        cleanup();
        setError(micError(err, "Could not place the call."));
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener(CALL_EVENT, onCall);
    return () => window.removeEventListener(CALL_EVENT, onCall);
  }, [newConnection, cleanup]);

  async function answer(c: Ringing) {
    setBusy(true);
    setError(null);
    try {
      const conn = await newConnection();
      await conn.setRemoteDescription({ type: "offer", sdp: c.offerSdp });
      await conn.setLocalDescription(await conn.createAnswer());
      await iceGathered(conn);
      const res = await answerCall(c.id, conn.localDescription!.sdp);
      if (!res.ok) {
        cleanup();
        setError(res.message ?? "Could not answer.");
      } else {
        setLive({ id: c.id, who: who(c), since: Date.now() });
      }
    } catch (e) {
      cleanup();
      setError(micError(e, "Could not answer the call."));
    } finally {
      setRinging([]);
      setBusy(false);
    }
  }

  async function decline(c: Ringing) {
    setBusy(true);
    await rejectCall(c.id);
    setRinging((r) => r.filter((x) => x.id !== c.id));
    setBusy(false);
  }

  async function end() {
    if (!live) return;
    setBusy(true);
    await hangUp(live.id);
    cleanup();
    setBusy(false);
  }

  function toggleMute() {
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  }

  const secs = live?.since ? Math.max(0, Math.floor((now - live.since) / 1000)) : 0;

  return (
    <>
      <audio ref={audio} autoPlay />
      {(incoming || live || error) && (
        <div
          role="dialog"
          aria-live="assertive"
          className="animate-toast fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-50 mx-auto max-w-sm rounded-2xl bg-night p-4 text-white shadow-2xl ring-1 ring-white/10 lg:left-auto lg:right-6 lg:top-6 print:hidden"
        >
          {live ? (
            <>
              <p className="text-xs text-glow">
                {live.since ? <>On call · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</> : "Ringing on WhatsApp…"}
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold">{live.who}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={toggleMute} className={cn("flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium", muted ? "bg-amber-500 text-night" : "bg-white/10")}>
                  {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />} {muted ? "Unmute" : "Mute"}
                </button>
                <button disabled={busy} onClick={end} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-medium disabled:opacity-50">
                  <PhoneOff className="size-4" /> {live.since ? "Hang up" : "Cancel"}
                </button>
              </div>
            </>
          ) : incoming ? (
            <>
              <p className="flex items-center gap-2 text-xs text-glow">
                <Phone className="size-3.5 animate-ring" /> Incoming WhatsApp call
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold">{who(incoming)}</p>
              <p className="text-xs text-white/55">{formatPhone(incoming.fromPhone)}</p>
              <div className="mt-4 flex gap-2">
                <button disabled={busy} onClick={() => decline(incoming)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-medium disabled:opacity-50">
                  <PhoneOff className="size-4" /> Decline
                </button>
                <button disabled={busy} onClick={() => answer(incoming)} className="relative flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-medium text-night disabled:opacity-50">
                  {!busy && <span aria-hidden className="absolute inset-0 animate-ping rounded-xl bg-emerald-400/40" />}
                  <Phone className="size-4" /> {busy ? "Connecting…" : "Answer"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-white/60">Dismiss</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

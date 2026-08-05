"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch, responseError, useSession } from "@/lib/client-api";
import { staffSpeakerRoleLabel, type StaffSpeakerRole } from "@/lib/speaker-roles";
import type { ConsultationStatus, ProviderStatus } from "@/lib/types";

type RecorderState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "uploading" | "starting" | "error";

export default function RecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { csrf } = useSession();
  const [consultation, setConsultation] = useState<{ patient_reference: string; speaker_role: StaffSpeakerRole; status: ConsultationStatus } | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const startInFlightRef = useRef(false);

  useEffect(() => {
    fetch(`/api/consultations/${id}`, { cache: "no-store" })
      .then(async (response) => await response.json() as { consultation?: { patient_reference: string; speaker_role: StaffSpeakerRole; status: ConsultationStatus } })
      .then((data) => {
        if (data.consultation) setConsultation(data.consultation);
      });
  }, [id]);

  useEffect(() => {
    fetch("/api/provider-status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Provider status unavailable.");
        return await response.json() as ProviderStatus;
      })
      .then((data) => setProviderStatus(data))
      .catch(() => setProviderStatus({
        provider: "invalid",
        mode: "unavailable",
        ready: false,
        transcriptionModel: null,
        message: "The transcription service status could not be verified.",
      }));
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (["recording", "paused", "stopped", "uploading"].includes(state)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  useEffect(() => () => {
    stopTracks();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl, stopTracks]);

  async function startRecording() {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    setState("requesting");
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support secure microphone recording. Use current Safari, Chrome, or Edge.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const startResponse = await apiFetch(`/api/consultations/${id}/recording/start`, { method: "POST" }, csrf);
      if (!startResponse.ok) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error(await responseError(startResponse));
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = supportedMimeType();
      const recorderOptions: MediaRecorderOptions = { audioBitsPerSecond: 64_000 };
      if (mimeType) recorderOptions.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, recorderOptions);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        setBlob(audioBlob);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return URL.createObjectURL(audioBlob);
        });
        setState("stopped");
        stopTracks();
      };
      recorder.start(1000);
      setSeconds(0);
      setState("recording");
      const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock) {
        try {
          wakeLockRef.current = await nav.wakeLock.request("screen");
        } catch {
          // Wake Lock is an enhancement. Recording must continue if the browser declines it.
          wakeLockRef.current = null;
        }
      }
      startInFlightRef.current = false;
    } catch (caught) {
      startInFlightRef.current = false;
      stopTracks();
      setState("error");
      const denied = caught instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(caught.name);
      setError(denied
        ? "Microphone access was denied. Open the browser's site settings, allow Microphone, then try again."
        : caught instanceof Error ? caught.message : "The microphone could not be started.");
    }
  }

  function pauseRecording() {
    recorderRef.current?.pause();
    setState("paused");
  }

  function resumeRecording() {
    recorderRef.current?.resume();
    setState("recording");
  }

  async function stopRecording() {
    recorderRef.current?.requestData();
    recorderRef.current?.stop();
    await apiFetch(`/api/consultations/${id}/recording/stop`, { method: "POST" }, csrf);
  }

  async function discardRecording() {
    if (!window.confirm("Discard this recording? The audio on this device will be lost.")) return;
    if (recorderRef.current?.state && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopTracks();
    setBlob(null);
    setPreviewUrl("");
    setSeconds(0);
    await apiFetch(`/api/consultations/${id}/recording/discard`, { method: "POST" }, csrf);
    setState("idle");
  }

  async function uploadAndProcess() {
    if (!blob) return;
    setState("uploading");
    setError("");
    const form = new FormData();
    form.append("audio", new File([blob], `recording.${extensionFor(blob.type)}`, { type: blob.type }));
    form.append("durationSeconds", String(Math.max(seconds, 1)));
    let audioSaved = false;
    try {
      const upload = await apiFetch(`/api/consultations/${id}/upload`, { method: "POST", body: form }, csrf);
      if (!upload.ok) throw new Error(await responseError(upload));
      audioSaved = true;
      setState("starting");
      const process = await apiFetch(`/api/consultations/${id}/process`, { method: "POST" }, csrf);
      if (!process.ok) throw new Error(await responseError(process));
      router.push(`/coordinator/consultations/${id}/review`);
    } catch (caught) {
      if (audioSaved) {
        router.push(`/coordinator/consultations/${id}/review`);
        return;
      }
      setState("stopped");
      setError(caught instanceof Error ? caught.message : "The recording was not uploaded. It is still available on this device; try again.");
    }
  }

  const activelyRecording = state === "recording" || state === "paused";
  return (
    <AppShell requiredRole="coordinator">
      <div className="record-page">
        <div className="page-heading split-heading compact">
          <div>
            <p className="eyebrow">Patient reference</p>
            <h1>{consultation?.patient_reference ?? "Loading…"}</h1>
            {consultation && <p className="record-speaker-chip">{staffSpeakerRoleLabel(consultation.speaker_role)} speaking with the patient</p>}
          </div>
          {consultation && <StatusBadge status={activelyRecording ? "recording" : consultation.status} />}
        </div>
        {providerStatus && (
          <aside className={`notice provider-notice provider-${providerStatus.mode}`} role={providerStatus.ready ? "status" : "alert"}>
            <div>
              <strong>{providerStatus.mode === "live" ? "Live provider configured" : providerStatus.mode === "demo" ? "Demo transcript mode" : "Live transcription setup required"}</strong>
              <p>{providerStatus.message}</p>
            </div>
          </aside>
        )}
        <section className={`recorder-card ${activelyRecording ? "is-recording" : ""}`}>
          <div className="recording-indicator" role="status" aria-live="polite">
            <span className="recording-dot" />
            <span>{state === "recording" ? "Recording" : state === "paused" ? "Paused" : state === "stopped" ? "Ready to review" : state === "uploading" ? "Saving recording" : state === "starting" ? "Audio saved" : "Ready"}</span>
          </div>
          <div className="timer" aria-label={`Elapsed time ${formatTime(seconds)}`}>{formatTime(seconds)}</div>
          <p className="recorder-help">
            {activelyRecording ? "Keep this app open and visible. The screen will stay awake where supported." : state === "stopped" ? "Listen to the preview before sending it for processing." : "Tap start when everyone is ready and consent is confirmed."}
          </p>
          <div className="recorder-controls">
            {["idle", "error"].includes(state) && (
              <button className="record-button" onClick={startRecording} disabled={!consultation || !providerStatus?.ready}>
                <span aria-hidden="true" />
                {state === "requesting" ? "Requesting microphone…" : "Start recording"}
              </button>
            )}
            {state === "requesting" && <button className="record-button" disabled>Requesting microphone…</button>}
            {state === "recording" && (
              <>
                <button className="button secondary large" onClick={pauseRecording}>Pause</button>
                <button className="button danger large" onClick={stopRecording}>Stop recording</button>
              </>
            )}
            {state === "paused" && (
              <>
                <button className="button primary large" onClick={resumeRecording}>Resume</button>
                <button className="button danger large" onClick={stopRecording}>Stop recording</button>
              </>
            )}
          </div>
          {previewUrl && !["uploading", "starting"].includes(state) && (
            <div className="preview-panel">
              <label>Recording preview</label>
              <audio controls preload="metadata" src={previewUrl}>Your browser does not support audio playback.</audio>
              <div className="preview-actions">
                <button className="button text danger-text" onClick={discardRecording}>Discard and record again</button>
                <button className="button primary" onClick={uploadAndProcess} disabled={!providerStatus?.ready}>
                  {providerStatus?.mode === "demo" ? "Generate demo draft" : "Submit for processing"}
                </button>
              </div>
            </div>
          )}
          {["uploading", "starting"].includes(state) && (
            <div className="processing-box" role="status">
              <span className="spinner" />
              {state === "uploading"
                ? <div><strong>Saving the recording securely</strong><p>Stay on this page until the secure save finishes.</p></div>
                : <div><strong>Recording saved</strong><p>Your audio is safe. AI processing is starting in the background.</p></div>}
            </div>
          )}
          {error && <p className="form-error recorder-error" role="alert">{error}</p>}
        </section>
        <aside className="notice">
          <strong>Know where audio goes</strong>
          <p>{providerStatus?.mode === "live"
            ? "Audio is stored privately, then sent by the server to the configured OpenAI project for transcription and summary generation."
            : providerStatus?.mode === "demo"
              ? "Audio stays in server-controlled storage. Demo mode does not inspect its contents."
              : "Recording is disabled until the live transcription service is configured."}</p>
        </aside>
      </div>
    </AppShell>
  );
}

function supportedMimeType(): string {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mime: string): string {
  return mime.includes("mp4") ? "m4a" : mime.includes("wav") ? "wav" : "webm";
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

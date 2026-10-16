// Unlinked test page (/lab/voice) for Y4NN's phones: download whisper-tiny once, read phrases aloud,
// and copy the timings. English only: it is a measuring tool, not a user feature.
import { useEffect, useRef, useState } from "react";
import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { Button } from "../../components/ui/button.tsx";
import { parseQuickEntry } from "../../capture/quickEntry.ts";
import { cachedModelBytes, clearModel, decodeTo16k, LAB_MODEL_ID, loadRecognizer, SAMPLE_RATE, transcribe } from "./whisperLab.ts";

const PHRASES = [
  "taxi deux mille",
  "j’ai payé deux mille cinq cents de crédit",
  "salaire soixante-quinze mille",
  "essence mille cinq cents",
  "quatre-vingt-dix mille pour le loyer",
];

type Trial = { phrase: string; heard: string; amount: string | null; audioSeconds: number; inferenceMs: number };
type Load = { state: "idle" } | { state: "loading"; loaded: number; total: number } | { state: "ready"; ms: number; bytes: number } | { state: "failed"; message: string };

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function deviceLine(): string {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return [
    navigator.userAgent,
    `cores=${navigator.hardwareConcurrency}`,
    `memory=${memory ?? "?"}GB`,
    `webgpu=${"gpu" in navigator}`,
    `isolated=${globalThis.crossOriginIsolated}`,
  ].join(" · ");
}

export default function VoiceLabPage() {
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [cached, setCached] = useState<number | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognizer = useRef<AutomaticSpeechRecognitionPipeline | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    void cachedModelBytes().then(setCached, () => setCached(null));
  }, []);

  const startLoad = async () => {
    setError(null);
    setLoad({ state: "loading", loaded: 0, total: 0 });
    const started = performance.now();
    try {
      recognizer.current = await loadRecognizer(({ loaded, total }) => setLoad({ state: "loading", loaded, total }));
      const bytes = await cachedModelBytes();
      setCached(bytes);
      setLoad({ state: "ready", ms: Math.round(performance.now() - started), bytes });
    } catch (cause) {
      setLoad({ state: "failed", message: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const finishRecording = async (chunks: Blob[], type: string) => {
    const model = recognizer.current;
    if (model == null) return;
    setBusy(true);
    try {
      const audio = await decodeTo16k(new Blob(chunks, { type }));
      const started = performance.now();
      const heard = await transcribe(model, audio);
      const inferenceMs = Math.round(performance.now() - started);
      const phrase = PHRASES[phraseIndex] ?? "";
      setTrials((previous) => [...previous, { phrase, heard, amount: parseQuickEntry(heard).amount, audioSeconds: audio.length / SAMPLE_RATE, inferenceMs }]);
      setPhraseIndex((index) => (index + 1) % PHRASES.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        void finishRecording(chunks, media.mimeType);
      };
      recorder.current = media;
      media.start();
      setRecording(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const report = [
    `model=${LAB_MODEL_ID} q8`,
    load.state === "ready" ? `load=${load.ms}ms cache=${megabytes(load.bytes)}` : `load=${load.state}`,
    deviceLine(),
    ...trials.map((trial) => `"${trial.phrase}" → "${trial.heard}" · amount=${trial.amount ?? "none"} · audio=${trial.audioSeconds.toFixed(1)}s · infer=${trial.inferenceMs}ms`),
  ].join("\n");

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4">
      <h1 className="text-xl font-semibold">Voice lab</h1>
      <p className="text-sm text-muted-foreground">Whisper tiny on this phone. Audio stays on the device.</p>

      <section className="space-y-2">
        <p className="text-sm">Stored model: {cached == null ? "unknown" : megabytes(cached)}</p>
        {load.state === "idle" && <Button onClick={() => { void startLoad(); }}>Load the model</Button>}
        {load.state === "loading" && (
          <p className="text-sm" aria-live="polite">Downloading {megabytes(load.loaded)}{load.total > 0 ? ` / ${megabytes(load.total)}` : ""}</p>
        )}
        {load.state === "ready" && <p className="text-sm">Ready in {(load.ms / 1000).toFixed(1)} s</p>}
        {load.state === "failed" && <p className="text-sm text-destructive">Load failed: {load.message}</p>}
      </section>

      {load.state === "ready" && (
        <section className="space-y-2">
          <p className="text-sm">Say: <strong>{PHRASES[phraseIndex]}</strong></p>
          <Button onClick={() => { void toggleRecording(); }} disabled={busy}>
            {recording ? "Stop" : busy ? "Transcribing…" : "Record"}
          </Button>
        </section>
      )}

      {error != null && <p className="text-sm text-destructive">{error}</p>}

      {trials.length > 0 && (
        <ol className="space-y-2 text-sm">
          {trials.map((trial, index) => (
            <li key={index} className="rounded-md border p-2">
              <div>Said: {trial.phrase}</div>
              <div>Heard: {trial.heard || "(nothing)"}</div>
              <div>Amount: {trial.amount ?? "none"} · audio {trial.audioSeconds.toFixed(1)} s · {trial.inferenceMs} ms</div>
            </li>
          ))}
        </ol>
      )}

      <section className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(report); }}>Copy results</Button>
        <Button variant="outline" onClick={() => { void clearModel().then(() => setCached(0)); }}>Delete the model</Button>
      </section>
      <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{deviceLine()}</pre>
    </main>
  );
}

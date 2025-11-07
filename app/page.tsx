"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RestoreOptions = {
  denoise: number; // 0-30
  sharpen: number; // 0-2 (weight)
  contrast: number; // -50..50
  saturation: number; // -50..50
  scratchRemoval: number; // 0..100 threshold
  auto: boolean;
  maxSize: number; // pixels on long edge
};

type WorkerRequest = {
  type: "process";
  id: string;
  buffer: ArrayBuffer;
  options: RestoreOptions;
};

type WorkerDone = {
  type: "done";
  id: string;
  buffer: ArrayBuffer;
  mime: string;
};

type WorkerError = {
  type: "error";
  id?: string;
  message: string;
};

function useRestoreWorker() {
  const workerRef = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL("./workers/restore.worker.ts", import.meta.url));
    workerRef.current = worker;
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type: string };
      if (data.type === "ready") setReady(true);
    };
    worker.addEventListener("message", onMsg);
    return () => {
      worker.removeEventListener("message", onMsg);
      worker.terminate();
    };
  }, []);

  const process = useCallback(
    (file: File, options: RestoreOptions) => {
      return new Promise<Blob>((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) return reject(new Error("Worker n?o inicializado"));
        const id = Math.random().toString(36).slice(2);
        const onMsg = (e: MessageEvent<WorkerDone | WorkerError>) => {
          if (e.data.type === "done" && (e.data as WorkerDone).id === id) {
            const { buffer, mime } = e.data as WorkerDone;
            worker.removeEventListener("message", onMsg as any);
            resolve(new Blob([buffer], { type: mime }));
          } else if (e.data.type === "error") {
            const err = e.data as WorkerError;
            if (!err.id || err.id === id) {
              worker.removeEventListener("message", onMsg as any);
              reject(new Error(err.message));
            }
          }
        };
        worker.addEventListener("message", onMsg as any);
        file.arrayBuffer().then((buffer) => {
          const msg: WorkerRequest = { type: "process", id, buffer, options };
          worker.postMessage(msg, [buffer]);
        });
      });
    },
    []
  );

  return { ready, process };
}

function ImageCompare({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
        <img src={beforeUrl} alt="Antes" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={afterUrl} alt="Depois" className="absolute inset-0 h-full w-full object-contain" />
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4">
        <input className="range" type="range" min={0} max={100} value={pos} onChange={(e) => setPos(parseInt(e.target.value))} />
      </div>
    </div>
  );
}

export default function Page() {
  const { ready, process } = useRestoreWorker();
  const [file, setFile] = useState<File | null>(null);
  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opts, setOpts] = useState<RestoreOptions>({
    denoise: 12,
    sharpen: 0.8,
    contrast: 10,
    saturation: 8,
    scratchRemoval: 35,
    auto: true,
    maxSize: 2000,
  });

  useEffect(() => () => {
    if (inputUrl) URL.revokeObjectURL(inputUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  }, [inputUrl, outputUrl]);

  const onFile = useCallback((f: File) => {
    setFile(f);
    setOutputUrl(null);
    setError(null);
    const url = URL.createObjectURL(f);
    setInputUrl(url);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  const restore = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await process(file, opts);
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao processar a imagem");
    } finally {
      setBusy(false);
    }
  }, [file, process, opts]);

  const disabled = !ready || !file || busy;

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Restaure fotos antigas</h1>
        <p className="text-white/70">Remova ru?dos e arranh?es, melhore contraste e nitidez ? tudo no seu navegador.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="card flex flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <div className="text-sm text-white/70">Arraste e solte uma foto antiga</div>
            <label className="btn btn-secondary cursor-pointer text-sm">
              <input type="file" accept="image/*" className="hidden" onChange={onChange} />
              Selecionar arquivo
            </label>
            {file && (
              <div className="mt-2 text-xs text-white/60">{file.name}</div>
            )}
          </div>

          <div className="card mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Redu??o de ru?do</span>
              <input className="range max-w-[55%]" type="range" min={0} max={30} value={opts.denoise}
                     onChange={(e) => setOpts(v => ({...v, denoise: parseInt(e.target.value)}))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Nitidez</span>
              <input className="range max-w-[55%]" type="range" min={0} max={200} value={Math.round(opts.sharpen*100)}
                     onChange={(e) => setOpts(v => ({...v, sharpen: parseInt(e.target.value)/100}))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Contraste</span>
              <input className="range max-w-[55%]" type="range" min={-50} max={50} value={opts.contrast}
                     onChange={(e) => setOpts(v => ({...v, contrast: parseInt(e.target.value)}))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Satura??o</span>
              <input className="range max-w-[55%]" type="range" min={-50} max={50} value={opts.saturation}
                     onChange={(e) => setOpts(v => ({...v, saturation: parseInt(e.target.value)}))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Remover arranh?es</span>
              <input className="range max-w-[55%]" type="range" min={0} max={100} value={opts.scratchRemoval}
                     onChange={(e) => setOpts(v => ({...v, scratchRemoval: parseInt(e.target.value)}))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/80">Tamanho m?x. processamento</span>
              <input className="range max-w-[55%]" type="range" min={800} max={3000} value={opts.maxSize}
                     onChange={(e) => setOpts(v => ({...v, maxSize: parseInt(e.target.value)}))} />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button className="btn btn-primary w-full" disabled={disabled} onClick={restore}>
              {busy ? "Processando..." : "Restaurar automaticamente"}
            </button>
            {outputUrl && (
              <a className="btn btn-secondary" href={outputUrl} download>
                Baixar
              </a>
            )}
          </div>
          {!ready && (
            <div className="mt-2 text-xs text-yellow-300/80">Carregando mecanismo de processamento...</div>
          )}
          {error && (
            <div className="mt-2 text-xs text-red-300/90">{error}</div>
          )}
        </div>
        <div className="md:col-span-2">
          <div className="card">
            {!inputUrl && (
              <div className="flex h-[420px] items-center justify-center text-white/50">
                Carregue uma foto para visualizar aqui
              </div>
            )}
            {inputUrl && !outputUrl && (
              <div className="relative">
                <img src={inputUrl} alt="Pr?-visualiza??o" className="mx-auto max-h-[70vh] w-auto rounded" />
              </div>
            )}
            {inputUrl && outputUrl && (
              <ImageCompare beforeUrl={inputUrl} afterUrl={outputUrl} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

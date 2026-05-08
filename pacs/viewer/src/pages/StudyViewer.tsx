import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getStudyDetail, getInstances,
  formatPatientName, formatDate,
  PACS_URL,
  type StudyDetail, type SeriesInfo, type InstanceInfo,
} from '../api/pacs';
import {
  ArrowLeft, Maximize2, ZoomIn, ZoomOut, Move,
  Ruler, Crosshair, RotateCcw, Download, Activity,
  AlertTriangle, ChevronLeft, ChevronRight, Layers,
} from 'lucide-react';
import clsx from 'clsx';

// ── Cornerstone init (module-level singleton) ─────────────────────────────────
// Initialized once on first viewer mount, never again.
// csCore/csTools are cached here so the rendering-engine cleanup can run
// synchronously — avoiding the async-import race that leaks WebGL contexts.
let csInitialized = false;
let csInitPromise: Promise<void> | null = null;
let _csCore: { getRenderingEngine?: (id: string) => { destroy?: () => void } | undefined } | null = null;
let _csTools: { ToolGroupManager: { destroyToolGroup: (id: string) => void } } | null = null;

async function initCornerstone() {
  if (csInitialized) return;
  if (csInitPromise) return csInitPromise;

  csInitPromise = (async () => {
    // Dynamic imports keep the heavy Cornerstone bundle out of the initial chunk
    const [csCore, csTools, csDICOMLoader] = await Promise.all([
      import('@cornerstonejs/core'),
      import('@cornerstonejs/tools'),
      import('@cornerstonejs/dicom-image-loader'),
    ]);

    _csCore = csCore as unknown as typeof _csCore;
    _csTools = csTools as unknown as typeof _csTools;

    // Cap workers at 4 — each GPU-accelerated JPEG2000 worker can spin up an
    // OffscreenCanvas WebGL context; Chrome's limit is ~16 per page total.
    (csDICOMLoader as unknown as { init: (opts: unknown) => void })
      .init({ maxWebWorkers: Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1)) });

    await csCore.init();

    const tools = csTools as unknown as {
      init: () => void;
      addTool: (t: unknown) => void;
      WindowLevelTool: unknown;
      PanTool: unknown;
      ZoomTool: unknown;
      StackScrollTool: unknown;
      LengthTool: unknown;
      AngleTool: unknown;
    };
    tools.init();
    [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool,
     tools.StackScrollTool, tools.LengthTool, tools.AngleTool]
      .filter(Boolean).forEach(t => tools.addTool(t));

    csInitialized = true;
  })();

  return csInitPromise;
}

// ── Fetch timing helpers ───────────────────────────────────────────────────────
// Reads actual WADO transfer time from the browser Performance API.
// The PACS server sends Timing-Allow-Origin: * so cross-origin entries are exposed.
function getWadoFetchMs(imageId: string): number | null {
  const url = imageId.replace(/^wadouri:/, '');
  const entries = performance.getEntriesByName(url, 'resource') as PerformanceResourceTiming[];
  if (!entries.length) return null;
  const e = entries[entries.length - 1];
  const ms = Math.round(e.responseEnd - e.requestStart);
  return ms > 0 ? ms : null;
}

function speedTier(ms: number): { label: string; cls: string; dot: string } {
  if (ms < 300)  return { label: 'Fast',     cls: 'text-green-400',  dot: 'bg-green-400' };
  if (ms < 2000) return { label: 'Degraded', cls: 'text-yellow-400', dot: 'bg-yellow-400' };
  return           { label: 'Slow',     cls: 'text-red-400',    dot: 'bg-red-400' };
}

function formatThroughput(bytes: number, ms: number): string {
  const mbps = (bytes * 8) / (ms / 1000) / 1_000_000;
  return mbps >= 1 ? `${mbps.toFixed(1)} Mb/s` : `${(mbps * 1000).toFixed(0)} Kb/s`;
}

const RENDERING_ENGINE_ID = 'pacs-re';
const VIEWPORT_ID         = 'pacs-vp';
const TOOL_GROUP_ID       = 'pacs-tg';

type ToolName = 'WindowLevel' | 'Pan' | 'Zoom' | 'Length' | 'Angle';

interface LatencyConfig {
  active: boolean;
  imageLatencyMs: number;
  jitterMs: number;
}

interface ViewportInfo {
  windowCenter: number;
  windowWidth: number;
  imageIndex: number;
  totalImages: number;
}

export default function StudyViewer() {
  const { studyUID } = useParams<{ studyUID: string }>();
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLDivElement>(null);

  const [study, setStudy]           = useState<StudyDetail | null>(null);
  const [series, setSeries]         = useState<SeriesInfo[]>([]);
  const [activeSeries, setActiveSeries] = useState<SeriesInfo | null>(null);
  const [instances, setInstances]   = useState<InstanceInfo[]>([]);
  const [loadingStudy, setLoadingStudy] = useState(true);
  const [loadingImages, setLoadingImages] = useState(false);
  const [error, setError]           = useState('');
  const [activeTool, setActiveTool]     = useState<ToolName>('WindowLevel');
  const [vpInfo, setVpInfo]             = useState<ViewportInfo | null>(null);
  const [loadTime, setLoadTime]         = useState<number | null>(null);
  const [latencyConfig, setLatencyConfig] = useState<LatencyConfig | null>(null);
  const [lastFetchMs, setLastFetchMs]   = useState<number | null>(null);
  const [loadElapsed, setLoadElapsed]   = useState(0);
  const [downloading, setDownloading]   = useState(false);
  const [downloadResult, setDownloadResult] = useState<{ ms: number; bytes: number } | null>(null);

  // ── Load study metadata ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!studyUID) return;
    (async () => {
      setLoadingStudy(true);
      setError('');
      try {
        const detail = await getStudyDetail(studyUID);
        setStudy(detail);
        setSeries(detail.series);
        if (detail.series.length > 0) setActiveSeries(detail.series[0]);
      } catch (err: unknown) {
        setError((err as { message?: string })?.message || 'Failed to load study');
      } finally {
        setLoadingStudy(false);
      }
    })();
  }, [studyUID]);

  // ── Load instances for the active series ────────────────────────────────────
  useEffect(() => {
    if (!studyUID || !activeSeries) return;
    (async () => {
      try {
        const inst = await getInstances(studyUID, activeSeries.seriesInstanceUID);
        setInstances(inst.sort((a, b) => a.instanceNumber - b.instanceNumber));
      } catch {
        setInstances([]);
      }
    })();
  }, [studyUID, activeSeries]);

  // ── Poll latency status — drives the demo warning banner ────────────────────
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const r = await fetch(`${PACS_URL}/api/demo/latency`);
        const d: LatencyConfig = await r.json();
        if (live) setLatencyConfig(d);
      } catch { /* server not reachable — no banner */ }
      if (live) setTimeout(poll, 5000);
    };
    poll();
    return () => { live = false; };
  }, []);

  // ── Cornerstone rendering ────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewportRef.current || !activeSeries || instances.length === 0) return;
    if (!study?.hasImages) return;

    let destroyed = false;
    let stackNewImageHandler: EventListener | null = null;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

    // Suppress dicomParser buffer-overrun rejections that arise when Cornerstone
    // prefetches slices encoded with certain JPEG2000 profiles.  These are
    // per-slice decode failures — not viewer crashes — so we swallow them here
    // and let the user scroll past the affected frames.
    const dicomErrorHandler = (e: PromiseRejectionEvent) => {
      const msg: string = e.reason?.error?.exception ?? e.reason?.message ?? '';
      if (msg.includes('dicomParser') || msg.includes('buffer overrun')) {
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', dicomErrorHandler);

    setLoadingImages(true);
    setVpInfo(null);
    setLastFetchMs(null);
    setLoadElapsed(0);
    const t0 = performance.now();
    elapsedTimer = setInterval(() => {
      if (!destroyed) setLoadElapsed(Math.round((performance.now() - t0) / 100) / 10);
    }, 200);

    (async () => {
      try {
        await initCornerstone();
        if (destroyed) return;

        const csCore = await import('@cornerstonejs/core');
        const csTools = await import('@cornerstonejs/tools');

        const cs = csCore as unknown as {
          RenderingEngine: new (id: string) => {
            enableElement: (opts: unknown) => void;
            getViewport: (id: string) => {
              setStack: (ids: string[], idx?: number) => Promise<void>;
              render: () => void;
              setProperties: (props: unknown) => void;
              getProperties: () => { voiRange?: { lower: number; upper: number } };
              getCurrentImageIdIndex: () => number;
            };
            destroy: () => void;
          };
          Enums: { ViewportType: { STACK: string } };
        };

        const tools = csTools as unknown as {
          ToolGroupManager: {
            destroyToolGroup: (id: string) => void;
            createToolGroup: (id: string) => {
              addTool: (name: string) => void;
              addViewport: (vpId: string, reId: string) => void;
              setToolActive: (name: string, opts?: unknown) => void;
              setToolPassive: (name: string) => void;
            };
          };
          WindowLevelTool: { toolName: string };
          PanTool: { toolName: string };
          ZoomTool: { toolName: string };
          StackScrollTool: { toolName: string };
          LengthTool: { toolName: string };
          AngleTool: { toolName: string };
          Enums: { MouseBindings: { Primary: number; Secondary: number; Auxiliary: number; Wheel: number } };
        };

        // Clean up any previous engine/tool group
        try { tools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID); } catch {}
        try {
          const prev = (csCore as unknown as { getRenderingEngine?: (id: string) => unknown })
            .getRenderingEngine?.(RENDERING_ENGINE_ID) as { destroy?: () => void } | undefined;
          prev?.destroy?.();
        } catch {}

        const engine = new cs.RenderingEngine(RENDERING_ENGINE_ID);

        engine.enableElement({
          viewportId: VIEWPORT_ID,
          type: cs.Enums.ViewportType.STACK,
          element: viewportRef.current!,
          defaultOptions: { background: [0, 0, 0] },
        });

        // Tool group
        const toolGroup = tools.ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
        const mb = tools.Enums.MouseBindings;
        toolGroup.addTool(tools.WindowLevelTool.toolName);
        toolGroup.addTool(tools.PanTool.toolName);
        toolGroup.addTool(tools.ZoomTool.toolName);
        toolGroup.addTool(tools.StackScrollTool.toolName);
        toolGroup.addTool(tools.LengthTool.toolName);
        toolGroup.addTool(tools.AngleTool.toolName);
        toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);

        // Default bindings — v4: StackScrollTool uses explicit Wheel binding
        toolGroup.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: mb.Primary }] });
        toolGroup.setToolActive(tools.ZoomTool.toolName,        { bindings: [{ mouseButton: mb.Secondary }] });
        toolGroup.setToolActive(tools.PanTool.toolName,         { bindings: [{ mouseButton: mb.Auxiliary }] });
        toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: mb.Wheel }] });

        const viewport = engine.getViewport(VIEWPORT_ID);
        const imageIds = instances.map(i =>
          `wadouri:${PACS_URL}/wado?requestType=WADO&studyUID=${studyUID}&seriesUID=${activeSeries.seriesInstanceUID}&objectUID=${i.sopInstanceUID}`
        );

        await viewport.setStack(imageIds, 0);
        viewport.render();
        if (destroyed) return;

        if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
        const elapsed = Math.round(performance.now() - t0);
        setLoadTime(elapsed);

        // Measure first-image fetch time via the Performance API
        const firstMs = getWadoFetchMs(imageIds[0]);
        if (firstMs !== null) setLastFetchMs(firstMs);

        // Update per-image timing and slice index as the radiologist scrolls
        const onStackNewImage = () => {
          setTimeout(() => {
            if (destroyed) return;
            const vp = engine.getViewport(VIEWPORT_ID) as unknown as {
              getCurrentImageIdIndex: () => number;
            };
            const idx = vp.getCurrentImageIdIndex?.() ?? 0;
            const ms = getWadoFetchMs(imageIds[idx]);
            if (ms !== null) setLastFetchMs(ms);
            setVpInfo(prev => prev ? { ...prev, imageIndex: idx + 1 } : prev);
          }, 100);
        };
        stackNewImageHandler = onStackNewImage;
        viewportRef.current!.addEventListener('CORNERSTONE_STACK_NEW_IMAGE', onStackNewImage);

        // Read W/L from viewport for the overlay
        const props = viewport.getProperties();
        if (props?.voiRange) {
          const ww = Math.round(props.voiRange.upper - props.voiRange.lower);
          const wc = Math.round((props.voiRange.upper + props.voiRange.lower) / 2);
          setVpInfo({ windowCenter: wc, windowWidth: ww, imageIndex: 1, totalImages: imageIds.length });
        } else {
          setVpInfo({ windowCenter: 0, windowWidth: 0, imageIndex: 1, totalImages: imageIds.length });
        }

        setLoadingImages(false);

      } catch (err: unknown) {
        if (!destroyed) {
          console.error('[StudyViewer] Cornerstone error:', err);
          setError((err as { message?: string })?.message || 'Failed to render images');
          setLoadingImages(false);
        }
      }
    })();

    return () => {
      window.removeEventListener('unhandledrejection', dicomErrorHandler);
      if (elapsedTimer) clearInterval(elapsedTimer);
      if (stackNewImageHandler && viewportRef.current) {
        viewportRef.current.removeEventListener('CORNERSTONE_STACK_NEW_IMAGE', stackNewImageHandler);
      }
      destroyed = true;
      try { _csTools?.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID); } catch {}
      try { _csCore?.getRenderingEngine?.(RENDERING_ENGINE_ID)?.destroy?.(); } catch {}
    };
  }, [activeSeries, instances, studyUID, study]);

  // ── Switch active tool ────────────────────────────────────────────────────────
  const switchTool = useCallback(async (tool: ToolName) => {
    setActiveTool(tool);
    try {
      const csTools = await import('@cornerstonejs/tools');
      const tools = csTools as unknown as {
        ToolGroupManager: {
          getToolGroup: (id: string) => {
            setToolActive: (name: string, opts?: unknown) => void;
            setToolPassive: (name: string) => void;
          } | undefined;
        };
        WindowLevelTool: { toolName: string };
        PanTool: { toolName: string };
        ZoomTool: { toolName: string };
        LengthTool: { toolName: string };
        AngleTool: { toolName: string };
        Enums: { MouseBindings: { Primary: number } };
      };
      const tg = tools.ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
      if (!tg) return;
      const mb = tools.Enums.MouseBindings;
      const allTools = [
        tools.WindowLevelTool.toolName,
        tools.PanTool.toolName,
        tools.ZoomTool.toolName,
        tools.LengthTool.toolName,
        tools.AngleTool.toolName,
      ];
      allTools.forEach(t => tg.setToolPassive(t));
      const nameMap: Record<ToolName, string> = {
        WindowLevel: tools.WindowLevelTool.toolName,
        Pan:         tools.PanTool.toolName,
        Zoom:        tools.ZoomTool.toolName,
        Length:      tools.LengthTool.toolName,
        Angle:       tools.AngleTool.toolName,
      };
      tg.setToolActive(nameMap[tool], { bindings: [{ mouseButton: mb.Primary }] });
    } catch {}
  }, []);

  // ── Reset view ────────────────────────────────────────────────────────────────
  const resetView = useCallback(async () => {
    try {
      const csCore = await import('@cornerstonejs/core');
      const vp = (csCore as unknown as { getRenderingEngine?: (id: string) => { getViewport: (id: string) => { resetCamera: () => void; resetProperties: () => void; render: () => void } } | undefined })
        .getRenderingEngine?.(RENDERING_ENGINE_ID)?.getViewport(VIEWPORT_ID);
      vp?.resetCamera();
      vp?.resetProperties?.();
      vp?.render();
    } catch {}
  }, []);

  // ── Download current DICOM image ──────────────────────────────────────────────
  // Fetches the raw DICOM file for the currently displayed slice and saves it
  // to disk. Transfer time + throughput are shown in the viewport overlay so the
  // latency demo is immediately visible. ThousandEyes can also trigger this via
  // a transaction step or run an HTTP throughput test against the WADO endpoint.
  const downloadCurrentImage = useCallback(async () => {
    if (!vpInfo || !activeSeries || !studyUID || downloading) return;
    const inst = instances[vpInfo.imageIndex - 1];
    if (!inst) return;

    const url = `${PACS_URL}/wado?requestType=WADO` +
      `&studyUID=${studyUID}` +
      `&seriesUID=${activeSeries.seriesInstanceUID}` +
      `&objectUID=${inst.sopInstanceUID}`;

    setDownloading(true);
    setDownloadResult(null);
    const t0 = performance.now();

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ms = Math.round(performance.now() - t0);
      setDownloadResult({ ms, bytes: blob.size });

      const filename = [
        study?.patientName?.replace(/\^/g, '_') ?? 'patient',
        activeSeries.seriesDescription?.replace(/\s+/g, '_') ?? 'series',
        `img${vpInfo.imageIndex}.dcm`,
      ].join('_').replace(/[^a-zA-Z0-9_.-]/g, '_');

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      setTimeout(() => setDownloadResult(null), 6000);
    } catch {
      // silently fail — errors surface via browser console
    } finally {
      setDownloading(false);
    }
  }, [vpInfo, activeSeries, studyUID, instances, study, downloading]);

  if (loadingStudy) {
    return (
      <div className="flex items-center justify-center h-screen bg-pacs-bg">
        <div className="flex items-center gap-3 text-pacs-muted">
          <Activity className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Loading study…</span>
        </div>
      </div>
    );
  }

  if (error && !study) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-pacs-bg gap-4">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-pacs-text">{error}</p>
        <button onClick={() => navigate('/worklist')} className="text-pacs-accent hover:underline text-sm">
          Return to Worklist
        </button>
      </div>
    );
  }

  const TOOLS: { name: ToolName; icon: React.ReactNode; label: string }[] = [
    { name: 'WindowLevel', icon: <Crosshair className="w-4 h-4" />,  label: 'W/L' },
    { name: 'Pan',         icon: <Move className="w-4 h-4" />,       label: 'Pan' },
    { name: 'Zoom',        icon: <ZoomIn className="w-4 h-4" />,     label: 'Zoom' },
    { name: 'Length',      icon: <Ruler className="w-4 h-4" />,      label: 'Length' },
    { name: 'Angle',       icon: <ZoomOut className="w-4 h-4" />,    label: 'Angle' },
  ];

  return (
    <div className="flex flex-col h-screen bg-pacs-bg overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2 bg-pacs-surface border-b border-pacs-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/worklist')}
            className="flex items-center gap-1.5 text-pacs-muted hover:text-pacs-text transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Worklist
          </button>
          <span className="text-pacs-border">|</span>
          {study && (
            <div className="flex items-center gap-3">
              <span className="text-pacs-text text-sm font-medium">
                {formatPatientName(study.patientName)}
              </span>
              <span className="text-pacs-muted text-xs">{study.studyDescription}</span>
            </div>
          )}
        </div>

        {/* Tool buttons */}
        <div className="flex items-center gap-1">
          {TOOLS.map(t => (
            <button
              key={t.name}
              onClick={() => switchTool(t.name)}
              title={t.label}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors',
                activeTool === t.name
                  ? 'bg-pacs-accent text-white'
                  : 'bg-pacs-panel text-pacs-muted hover:text-pacs-text border border-pacs-border'
              )}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
          <div className="w-px h-6 bg-pacs-border mx-1" />
          <button
            onClick={resetView}
            title="Reset view"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
                       bg-pacs-panel text-pacs-muted hover:text-pacs-text border border-pacs-border"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={downloadCurrentImage}
            disabled={!vpInfo || downloading}
            title="Download current image as DICOM (.dcm)"
            data-testid="download-dicom"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
                       bg-pacs-panel text-pacs-muted hover:text-pacs-text border border-pacs-border
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading
              ? <Activity className="w-4 h-4 animate-pulse text-pacs-accent" />
              : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{downloading ? 'Downloading…' : 'Export'}</span>
          </button>
          <button
            title="Fullscreen"
            onClick={() => viewportRef.current?.closest('.viewer-container')?.requestFullscreen?.()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium
                       bg-pacs-panel text-pacs-muted hover:text-pacs-text border border-pacs-border"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── WAN latency demo banner ──────────────────────────────────────── */}
      {latencyConfig?.active && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 shrink-0">
          <div className="flex items-center gap-2 text-yellow-400 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              WAN latency simulation active —{' '}
              <strong>{latencyConfig.imageLatencyMs.toLocaleString()}ms</strong>
              {latencyConfig.jitterMs > 0 && ` + ${latencyConfig.jitterMs}ms jitter`}
              {' '}per image
            </span>
          </div>
          <span className="text-yellow-500/60 text-xs hidden md:block">
            ThousandEyes transaction test is monitoring this path
          </span>
        </div>
      )}

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Series panel */}
        <aside className="w-44 shrink-0 bg-pacs-surface border-r border-pacs-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-pacs-border">
            <div className="flex items-center gap-1.5 text-pacs-muted">
              <Layers className="w-3.5 h-3.5" />
              <span className="text-xs uppercase tracking-wider">Series</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto pacs-scroll">
            {series.map((s) => (
              <button
                key={s.seriesInstanceUID}
                onClick={() => setActiveSeries(s)}
                className={clsx(
                  'w-full text-left px-3 py-3 border-b border-pacs-border/50 transition-colors',
                  activeSeries?.seriesInstanceUID === s.seriesInstanceUID
                    ? 'bg-pacs-accent/10 border-l-2 border-l-pacs-accent'
                    : 'hover:bg-pacs-hover'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-pacs-text">S{s.seriesNumber}</span>
                  <span className="text-xs text-pacs-muted">{s.modality}</span>
                </div>
                <p className="text-xs text-pacs-text-dim leading-tight line-clamp-2">{s.seriesDescription}</p>
                <p className="text-xs text-pacs-muted mt-1">{s.numberOfInstances} img</p>
              </button>
            ))}
          </div>
        </aside>

        {/* Viewport */}
        <div className="flex-1 relative overflow-hidden viewer-container bg-black">

          {/* Cornerstone canvas target */}
          <div
            ref={viewportRef}
            className="absolute inset-0 cs-viewport"
            style={{ width: '100%', height: '100%' }}
          />

          {/* Loading overlay */}
          {loadingImages && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
              <div className="relative w-48 h-1 bg-pacs-border rounded overflow-hidden mb-3">
                <div className="absolute inset-y-0 left-0 w-1/2 bg-pacs-accent loading-scan rounded" />
              </div>
              {loadElapsed > 2 ? (
                <p className="text-yellow-400 text-sm">
                  Waiting for server response… {loadElapsed.toFixed(1)}s
                </p>
              ) : (
                <p className="text-pacs-muted text-sm">Loading DICOM images…</p>
              )}
              {activeSeries && (
                <p className="text-pacs-muted/60 text-xs mt-1">{activeSeries.seriesDescription}</p>
              )}
              {loadElapsed > 2 && latencyConfig?.active && (
                <p className="text-yellow-500/60 text-xs mt-2">
                  WAN latency simulation: {latencyConfig.imageLatencyMs.toLocaleString()}ms active
                </p>
              )}
            </div>
          )}

          {/* No images — seed data mode */}
          {!loadingStudy && !loadingImages && study && !study.hasImages && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/90">
              <Download className="w-12 h-12 text-pacs-border mb-4" />
              <p className="text-pacs-text text-sm font-medium mb-1">No DICOM files available</p>
              <p className="text-pacs-muted text-xs text-center max-w-xs mb-4">
                This study shows demo metadata only. Download sample images to view real DICOM data.
              </p>
              <code className="bg-pacs-panel border border-pacs-border rounded px-3 py-1.5 text-xs text-pacs-text font-mono">
                cd pacs/server && npm run download
              </code>
              <p className="text-pacs-muted text-xs mt-2">Then restart the PACS server</p>
            </div>
          )}

          {/* Error overlay */}
          {error && study?.hasImages && !loadingImages && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/80">
              <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* ── Image info overlays (top-left) ── */}
          {vpInfo && !loadingImages && study?.hasImages && (
            <>
              {/* Patient info — top left */}
              <div className="absolute top-3 left-3 z-10 pointer-events-none">
                <p className="text-white text-xs font-bold leading-tight drop-shadow">{formatPatientName(study?.patientName ?? '')}</p>
                <p className="text-gray-300 text-xs leading-tight drop-shadow">{study?.studyDescription}</p>
                {loadTime !== null && (
                  <p className="text-gray-500 text-xs mt-1">Load: {loadTime}ms</p>
                )}
              </div>

              {/* W/L — top right */}
              <div className="absolute top-3 right-3 z-10 pointer-events-none text-right">
                <p className="text-gray-300 text-xs drop-shadow">WW: {vpInfo.windowWidth}</p>
                <p className="text-gray-300 text-xs drop-shadow">WC: {vpInfo.windowCenter}</p>
              </div>

              {/* Slice nav + fetch speed — bottom center */}
              <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 z-10 pointer-events-none">
                <span className="text-gray-400 text-xs bg-black/60 px-2 py-0.5 rounded">
                  {vpInfo.imageIndex} / {vpInfo.totalImages}
                </span>
                {lastFetchMs !== null && (() => {
                  const { label, cls, dot } = speedTier(lastFetchMs);
                  const display = lastFetchMs >= 1000
                    ? `${(lastFetchMs / 1000).toFixed(1)}s`
                    : `${lastFetchMs}ms`;
                  return (
                    <span className={`flex items-center gap-1.5 text-xs bg-black/60 px-2 py-0.5 rounded font-mono ${cls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                      {display} · {label}
                    </span>
                  );
                })()}
                {downloadResult && (() => {
                  const { cls } = speedTier(downloadResult.ms);
                  const timeDisplay = downloadResult.ms >= 1000
                    ? `${(downloadResult.ms / 1000).toFixed(1)}s`
                    : `${downloadResult.ms}ms`;
                  return (
                    <span className={`flex items-center gap-1.5 text-xs bg-black/60 px-2 py-0.5 rounded font-mono ${cls}`}>
                      <Download className="w-3 h-3" />
                      {timeDisplay} · {formatThroughput(downloadResult.bytes, downloadResult.ms)}
                    </span>
                  );
                })()}
              </div>

              {/* Series info — bottom left */}
              <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
                {activeSeries && (
                  <p className="text-gray-400 text-xs drop-shadow">{activeSeries.seriesDescription}</p>
                )}
              </div>
            </>
          )}

          {/* Scroll hint when images are loaded */}
          {vpInfo && vpInfo.totalImages > 1 && !loadingImages && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-1 text-pacs-border">
                <ChevronLeft className="w-4 h-4 rotate-90" />
                <div className="w-0.5 h-8 bg-pacs-border/40 rounded" />
                <ChevronRight className="w-4 h-4 rotate-90" />
              </div>
            </div>
          )}
        </div>

        {/* Study info panel — right */}
        <aside className="w-48 shrink-0 bg-pacs-surface border-l border-pacs-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-pacs-border">
            <span className="text-xs text-pacs-muted uppercase tracking-wider">Study Info</span>
          </div>
          <div className="flex-1 overflow-auto pacs-scroll p-3 space-y-4">
            {study && (
              <>
                <div>
                  <p className="text-xs text-pacs-muted uppercase tracking-wider mb-1">Patient</p>
                  <p className="text-xs text-pacs-text font-medium">{formatPatientName(study.patientName)}</p>
                </div>
                <div>
                  <p className="text-xs text-pacs-muted uppercase tracking-wider mb-1">Description</p>
                  <p className="text-xs text-pacs-text-dim leading-relaxed">{study.studyDescription}</p>
                </div>
                <div>
                  <p className="text-xs text-pacs-muted uppercase tracking-wider mb-1">Series</p>
                  <p className="text-xs text-pacs-text">{series.length}</p>
                </div>
                {activeSeries && (
                  <div>
                    <p className="text-xs text-pacs-muted uppercase tracking-wider mb-1">Active Series</p>
                    <p className="text-xs text-pacs-text">{activeSeries.seriesDescription}</p>
                    <p className="text-xs text-pacs-muted mt-0.5">{activeSeries.numberOfInstances} images</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-pacs-muted uppercase tracking-wider mb-1">Active Tool</p>
                  <p className="text-xs text-pacs-text">{activeTool}</p>
                </div>
                <div className="border-t border-pacs-border pt-3">
                  <p className="text-xs text-pacs-muted uppercase tracking-wider mb-2">Controls</p>
                  <div className="space-y-1 text-xs text-pacs-muted leading-relaxed">
                    <p>Left drag — active tool</p>
                    <p>Right drag — zoom</p>
                    <p>Middle drag — pan</p>
                    <p>Scroll — next/prev slice</p>
                  </div>
                </div>
                {loadTime !== null && (
                  <div className="border-t border-pacs-border pt-3">
                    <p className="text-xs text-pacs-muted uppercase tracking-wider mb-2">Network</p>
                    <p className="text-xs text-pacs-text">
                      First image: {loadTime >= 1000 ? `${(loadTime / 1000).toFixed(1)}s` : `${loadTime}ms`}
                    </p>
                    {lastFetchMs !== null && (() => {
                      const { label, cls } = speedTier(lastFetchMs);
                      const display = lastFetchMs >= 1000
                        ? `${(lastFetchMs / 1000).toFixed(1)}s`
                        : `${lastFetchMs}ms`;
                      return (
                        <p className={`text-xs mt-0.5 font-mono ${cls}`}>
                          Last fetch: {display} · {label}
                        </p>
                      );
                    })()}
                    <p className="text-xs text-pacs-muted/60 mt-1.5 leading-relaxed">
                      ThousandEyes monitors this path end-to-end
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Download hint */}
          {study && !study.hasImages && (
            <div className="p-3 border-t border-pacs-border bg-pacs-panel">
              <p className="text-xs text-yellow-400/80 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Demo metadata only
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

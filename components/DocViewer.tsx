
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface DocViewerProps {
  data: string;
  label: string;
  filename: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.25;

const DocViewer: React.FC<DocViewerProps> = ({ data, label, filename, onClose }) => {
  const isPdf = data.startsWith('data:application/pdf');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const zoomIn  = () => setZoom(z => clampZoom(z + ZOOM_STEP));
  const zoomOut = () => setZoom(z => clampZoom(z - ZOOM_STEP));

  /* --- Mouse wheel zoom (centered on cursor) --- */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom(z => clampZoom(z + delta));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isPdf) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel, isPdf]);

  /* --- Drag to pan --- */
  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  };

  const onMouseUp = () => { dragging.current = false; };

  /* --- Keyboard --- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
      if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  /* --- Reset pan when zoom goes back to 1 --- */
  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  /* --- Print --- */
  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    if (isPdf) {
      win.document.write(`<html><body style="margin:0"><embed src="${data}" type="application/pdf" width="100%" height="100%" /></body></html>`);
    } else {
      win.document.write(`<html><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#111;min-height:100vh"><img src="${data}" style="max-width:100%;max-height:100vh;object-fit:contain" /></body></html>`);
    }
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  /* --- Download --- */
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = data;
    link.download = filename || label;
    link.click();
  };

  const cursorStyle = isPdf
    ? 'default'
    : zoom > 1
      ? dragging.current ? 'grabbing' : 'grab'
      : 'zoom-in';

  return (
    <div className="fixed inset-0 bg-black/95 z-[300] flex flex-col" onClick={onClose}>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center justify-between px-6 py-3 bg-black/60 backdrop-blur-md border-b border-white/10 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Left: title */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white font-black text-sm uppercase tracking-widest">{label}</span>
          {filename && (
            <span className="text-white/50 text-xs font-medium truncate max-w-xs">{filename}</span>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Zoom controls — images only */}
          {!isPdf && (
            <div className="flex items-center gap-1 bg-white/10 rounded-xl px-1 py-1">
              <button
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:bg-white/20 disabled:opacity-30 transition-all text-lg font-bold leading-none"
                title="Zoom arrière (−)"
              >−</button>

              <button
                onClick={resetView}
                className="px-2 h-8 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/20 transition-all text-xs font-black tracking-wider tabular-nums min-w-[52px]"
                title="Réinitialiser (0)"
              >
                {Math.round(zoom * 100)}%
              </button>

              <button
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:bg-white/20 disabled:opacity-30 transition-all text-lg font-bold leading-none"
                title="Zoom avant (+)"
              >+</button>
            </div>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all uppercase tracking-wider"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
            </svg>
            Imprimer
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 bg-[#345d6e] hover:bg-[#2c5263] text-white font-bold text-xs px-4 py-2 rounded-xl transition-all uppercase tracking-wider"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            Télécharger
          </button>

          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-red-500/80 text-white p-2 rounded-xl transition-all"
            title="Fermer (Échap)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Document area ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onClick={e => e.stopPropagation()}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: cursorStyle }}
      >
        {isPdf ? (
          <iframe
            src={data}
            className="w-full h-full border-0 bg-white"
            title={label}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center select-none">
            <img
              src={data}
              alt={label}
              draggable={false}
              className="rounded-xl shadow-2xl"
              style={{
                maxWidth: zoom <= 1 ? '100%' : 'none',
                maxHeight: zoom <= 1 ? '100%' : 'none',
                objectFit: 'contain',
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: dragging.current ? 'none' : 'transform 0.15s ease',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            />
          </div>
        )}

        {/* Zoom hint — shown only at default zoom */}
        {!isPdf && zoom === 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white/60 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full pointer-events-none select-none">
            Molette ou +/− pour zoomer
          </div>
        )}
      </div>
    </div>
  );
};

export default DocViewer;

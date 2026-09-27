import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pen, Eraser, RotateCcw, Trash2, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { CheckResult } from '../types';

interface HandwritingCanvasProps {
  onStrokeAdded: () => void;
  onCheckNow: () => void;
  isChecking: boolean;
  checkResult: CheckResult | null;
  onClearError: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  getCanvasSnapshot: () => string | null;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
}

const ERASER_RADIUS = 18;

// Distance from point (px, py) to line segment (x1, y1) -> (x2, y2)
function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Determines if a stroke object intersects or is near an eraser circle
function strokeIntersectsCircle(stroke: Stroke, center: Point, radius: number): boolean {
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    return Math.hypot(stroke.points[0].x - center.x, stroke.points[0].y - center.y) <= radius + stroke.width / 2;
  }

  // Fast bounding box check
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of stroke.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const effR = radius + stroke.width / 2;
  if (center.x < minX - effR || center.x > maxX + effR || center.y < minY - effR || center.y > maxY + effR) {
    return false;
  }

  // Segment collision check
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i];
    const p2 = stroke.points[i + 1];
    if (distanceToSegment(center.x, center.y, p1.x, p1.y, p2.x, p2.y) <= effR) {
      return true;
    }
  }
  return false;
}

export const HandwritingCanvas: React.FC<HandwritingCanvasProps> = ({
  onStrokeAdded,
  onCheckNow,
  isChecking,
  checkResult,
  onClearError,
  canvasRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [eraserPos, setEraserPos] = useState<Point | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 600 });
  const hasErasedInCurrentDragRef = useRef<boolean>(false);
  const lastEraserPointRef = useRef<Point | null>(null);

  // Clean up any old localStorage key from pencil mode
  useEffect(() => {
    try {
      localStorage.removeItem('red_pen_apple_pencil_mode');
    } catch {}
  }, []);

  // Redraw the canvas with notebook lines and all student strokes
  const redrawCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    strokesToDraw: Stroke[],
    inProgressStroke: Stroke | null
  ) => {
    // 1. Clean paper background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // 2. Notebook ruled lines - never affected by eraser
    const lineSpacing = 36;
    const startY = 48;
    ctx.beginPath();
    ctx.strokeStyle = '#E2E8F0'; // subtle light notebook blue-gray
    ctx.lineWidth = 1;

    for (let y = startY; y < height; y += lineSpacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // 3. Margin vertical red line (like standard composition / lined notebook)
    const marginX = 58;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)'; // soft red margin line
    ctx.lineWidth = 1.5;
    ctx.moveTo(marginX, 0);
    ctx.lineTo(marginX, height);
    ctx.stroke();

    // 4. Subtle binder holes on left margin
    const holeRadius = 6;
    const holeX = 22;
    const holeYs = [height * 0.18, height * 0.5, height * 0.82];
    ctx.fillStyle = '#F1F5F9';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    for (const hy of holeYs) {
      ctx.beginPath();
      ctx.arc(holeX, hy, holeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 5. Draw all active strokes (each stroke is an independent object)
    const allStrokes = inProgressStroke ? [...strokesToDraw, inProgressStroke] : strokesToDraw;

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) {
        if (stroke.points.length === 1) {
          ctx.save();
          ctx.fillStyle = stroke.color;
          ctx.beginPath();
          ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        continue;
      }

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length - 1; i++) {
        const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
      }

      const lastPoint = stroke.points[stroke.points.length - 1];
      ctx.lineTo(lastPoint.x, lastPoint.y);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  // Update canvas size to match container responsive dimensions
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.floor(rect.width);
      const height = Math.floor(Math.max(500, window.innerHeight - 340));

      const canvas = canvasRef.current;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        redrawCanvas(ctx, width, height, strokes, currentStroke);
      }
      setCanvasDimensions({ width, height });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [canvasRef, strokes, currentStroke, redrawCanvas]);

  // Redraw when strokes change
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawCanvas(ctx, canvasDimensions.width, canvasDimensions.height, strokes, currentStroke);
    ctx.restore();
  }, [strokes, currentStroke, canvasDimensions, canvasRef, redrawCanvas]);

  // Pointer coordinate calculation
  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Perform object-level erasure: removes any stroke object hit by eraser point
  const eraseStrokesAtPoint = useCallback((pt: Point): boolean => {
    let erasedAny = false;
    setStrokes(prevStrokes => {
      const surviving = prevStrokes.filter(stroke => {
        const hit = strokeIntersectsCircle(stroke, pt, ERASER_RADIUS);
        if (hit) erasedAny = true;
        return !hit;
      });

      if (erasedAny) {
        hasErasedInCurrentDragRef.current = true;
        // Save current strokes to undo stack before deleting
        setUndoStack(prev => [...prev.slice(-25), prevStrokes]);
        onClearError();
        return surviving;
      }
      return prevStrokes;
    });
    return erasedAny;
  }, [onClearError]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }

    const pos = getPointerPos(e);
    setIsDrawing(true);

    if (tool === 'eraser') {
      setEraserPos(pos);
      lastEraserPointRef.current = pos;
      hasErasedInCurrentDragRef.current = false;
      eraseStrokesAtPoint(pos);
    } else {
      // Pen: Start new stroke object
      const newStroke: Stroke = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        points: [pos],
        color: '#1E293B',
        width: 3.2,
      };
      setCurrentStroke(newStroke);

      if (checkResult?.status === 'error') {
        onClearError();
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPointerPos(e);

    if (tool === 'eraser') {
      setEraserPos(pos);
      if (isDrawing) {
        e.preventDefault();
        // Sample intermediate points if dragged quickly
        const lastPt = lastEraserPointRef.current;
        if (lastPt) {
          const dist = Math.hypot(pos.x - lastPt.x, pos.y - lastPt.y);
          const steps = Math.max(1, Math.floor(dist / 8));
          for (let s = 1; s <= steps; s++) {
            const interpX = lastPt.x + ((pos.x - lastPt.x) * s) / steps;
            const interpY = lastPt.y + ((pos.y - lastPt.y) * s) / steps;
            eraseStrokesAtPoint({ x: interpX, y: interpY });
          }
        } else {
          eraseStrokesAtPoint(pos);
        }
        lastEraserPointRef.current = pos;
      }
      return;
    }

    // Pen drawing mode
    if (!isDrawing || !currentStroke) return;
    e.preventDefault();

    const lastPoint = currentStroke.points[currentStroke.points.length - 1];
    if (lastPoint) {
      const dist = Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y);
      if (dist < 2.5) return;
    }

    setCurrentStroke(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, pos]
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture release fails
    }

    setIsDrawing(false);
    lastEraserPointRef.current = null;

    if (tool === 'eraser') {
      if (hasErasedInCurrentDragRef.current) {
        // Trigger auto-check on the modified solution after erasing objects
        onStrokeAdded();
      }
      hasErasedInCurrentDragRef.current = false;
    } else if (currentStroke && currentStroke.points.length > 0) {
      setUndoStack(prev => [...prev.slice(-25), strokes]);
      setStrokes(prev => [...prev, currentStroke]);
      onStrokeAdded();
    }
    setCurrentStroke(null);
  };

  const handlePointerLeave = () => {
    setEraserPos(null);
    if (isDrawing) {
      setIsDrawing(false);
      lastEraserPointRef.current = null;
      if (currentStroke && currentStroke.points.length > 0) {
        setUndoStack(prev => [...prev.slice(-25), strokes]);
        setStrokes(prev => [...prev, currentStroke]);
        onStrokeAdded();
      }
      setCurrentStroke(null);
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0) {
      if (strokes.length > 0) {
        setStrokes(prev => prev.slice(0, -1));
        onClearError();
        onStrokeAdded();
      }
      return;
    }

    const previousState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setStrokes(previousState);
    onClearError();
    onStrokeAdded();
  };

  const handleClear = () => {
    if (strokes.length > 0) {
      setUndoStack(prev => [...prev.slice(-25), strokes]);
      setStrokes([]);
    }
    setCurrentStroke(null);
    onClearError();
  };

  // Convert normalized 0-1000 bounding box to actual pixel coordinates
  const getPixelErrorBox = () => {
    if (checkResult?.status !== 'error') {
      return null;
    }

    // 1. If AI vision model returned bounding coordinates, use them
    if (checkResult.error_box && checkResult.error_box.length === 4) {
      const [ymin, xmin, ymax, xmax] = checkResult.error_box;
      const padX = 16;
      const padY = 12;

      const left = Math.max(10, (xmin / 1000) * canvasDimensions.width - padX);
      const top = Math.max(10, (ymin / 1000) * canvasDimensions.height - padY);
      const width = Math.min(canvasDimensions.width - left - 10, ((xmax - xmin) / 1000) * canvasDimensions.width + padX * 2);
      const height = Math.min(canvasDimensions.height - top - 10, ((ymax - ymin) / 1000) * canvasDimensions.height + padY * 2);

      return { left, top, width: Math.max(width, 70), height: Math.max(height, 42) };
    }

    // 2. Intelligent fallback: if AI detected error but omitted box, compute around the latest stroke
    if (strokes.length > 0) {
      const lastStroke = strokes[strokes.length - 1];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of lastStroke.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (minX !== Infinity) {
        return {
          left: Math.max(10, minX - 15),
          top: Math.max(10, minY - 10),
          width: Math.max(maxX - minX + 30, 80),
          height: Math.max(maxY - minY + 20, 48),
        };
      }
    }

    // 3. Fallback position in lower middle of notebook
    return {
      left: Math.max(30, canvasDimensions.width * 0.2),
      top: Math.max(60, canvasDimensions.height * 0.3),
      width: Math.min(canvasDimensions.width * 0.6, 260),
      height: 54,
    };
  };

  const errorBox = getPixelErrorBox();

  return (
    <div className="relative flex flex-col w-full h-full select-none">
      {/* Canvas Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#F4EFEA] border-b border-[#E5DEC9] rounded-t-xl text-sm">
        <div className="flex items-center gap-2">
          {/* Pen Tool Button */}
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              tool === 'pen'
                ? 'bg-[#D7263D] text-white shadow-sm ring-2 ring-[#D7263D]/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
            title="Write with digital ink"
          >
            <Pen className="w-4 h-4" />
            <span>Pen</span>
          </button>

          {/* Object Eraser Tool Button */}
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-medium transition-all ${
              tool === 'eraser'
                ? 'bg-[#D7263D] text-white shadow-sm ring-2 ring-[#D7263D]/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
            title="Object Eraser: tap or drag across any stroke to delete it whole without erasing notebook lines"
          >
            <Eraser className="w-4 h-4" />
            <span>Object Eraser</span>
          </button>

          <div className="h-5 w-px bg-slate-300 mx-1 hidden sm:block" />

          {/* Undo Button */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0 && undoStack.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Undo last stroke or erasure"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          {/* Clear Button */}
          <button
            type="button"
            onClick={handleClear}
            disabled={strokes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium bg-white text-rose-700 hover:bg-rose-50 border border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Clear all strokes"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>

        {/* Live Feedback Status & Check Now Button */}
        <div className="flex items-center gap-3">
          {tool === 'eraser' && (
            <span className="text-xs font-semibold text-[#D7263D] hidden lg:inline animate-pulse">
              Object Eraser: tap or swipe to delete whole strokes
            </span>
          )}

          {/* Status Indicator */}
          {isChecking ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-800 rounded-full text-xs font-semibold border border-amber-200 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Red Pen is checking...</span>
            </div>
          ) : checkResult?.status === 'solved' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-full text-xs font-semibold border border-emerald-300 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Solved ✓</span>
            </div>
          ) : checkResult?.status === 'on_track' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50/80 text-emerald-800 rounded-full text-xs font-medium border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Looking good</span>
            </div>
          ) : checkResult?.status === 'error' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-800 rounded-full text-xs font-semibold border border-rose-300">
              <AlertCircle className="w-3.5 h-3.5 text-[#D7263D]" />
              <span className="capitalize">{checkResult.error_type || 'Mistake'} spotted</span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 hidden md:inline">Write your work line by line</span>
          )}

          {/* Check Now Button */}
          <button
            type="button"
            onClick={onCheckNow}
            disabled={isChecking || strokes.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-[#D7263D] hover:bg-[#bd1f33] active:scale-98 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>Check now</span>
          </button>
        </div>
      </div>

      {/* Handwriting Canvas Area with Ruled Lines */}
      <div
        ref={containerRef}
        className={`relative w-full flex-1 bg-white overflow-hidden shadow-inner rounded-b-xl border border-t-0 border-[#E5DEC9] ${
          tool === 'eraser' ? 'cursor-none' : 'cursor-crosshair'
        }`}
        style={{ minHeight: '500px' }}
      >
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="w-full h-full block"
        />

        {/* Visual Object Eraser Ring Cursor */}
        {tool === 'eraser' && eraserPos && (
          <div
            className="absolute pointer-events-none rounded-full border-2 border-[#D7263D] bg-[#D7263D]/10 transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 shadow-sm"
            style={{
              left: `${eraserPos.x}px`,
              top: `${eraserPos.y}px`,
              width: `${ERASER_RADIUS * 2}px`,
              height: `${ERASER_RADIUS * 2}px`,
            }}
          >
            <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-[#D7263D]" />
          </div>
        )}

        {/* Empty Canvas Friendly Helper Watermark */}
        {strokes.length === 0 && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <Pen className="w-12 h-12 stroke-[1.2] text-slate-300 mb-2" />
            <p className="font-caveat text-3xl text-slate-500 font-semibold mb-1">
              Start writing your solution here...
            </p>
            <p className="text-xs text-slate-400 max-w-sm">
              Write with Apple Pencil, stylus, touch, or mouse. Red Pen will watch your steps and circle the first mistake automatically.
            </p>
          </div>
        )}

        {/* RED HAND-DRAWN ERROR CIRCLE & TEACHER NOTE OVERLAY */}
        {errorBox && (
          <div
            className="absolute pointer-events-none transition-all duration-300 animate-in fade-in zoom-in-95"
            style={{
              top: `${errorBox.top}px`,
              left: `${errorBox.left}px`,
              width: `${errorBox.width}px`,
              height: `${errorBox.height}px`,
            }}
          >
            {/* Hand-drawn sketchy red loop SVG circling the mistake */}
            <svg
              className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] overflow-visible pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* First organic loop */}
              <path
                d="M 12,50 C 12,20 30,12 50,12 C 75,12 92,25 92,50 C 92,75 75,90 48,90 C 25,90 10,75 12,48"
                fill="none"
                stroke="#D7263D"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.92"
                className="drop-shadow-[0_2px_4px_rgba(215,38,61,0.25)]"
              />
              {/* Second overlapping sketchy loop for authentic hand-drawn feel */}
              <path
                d="M 16,46 C 14,24 35,14 54,14 C 78,14 88,28 88,54 C 88,78 72,88 50,88 C 28,88 14,76 16,50"
                fill="none"
                stroke="#D7263D"
                strokeWidth="2.0"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.75"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

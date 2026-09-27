import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  HelpCircle, 
  AlertCircle, 
  RefreshCw, 
  BookOpen,
  ArrowLeft,
  User,
  Hash
} from 'lucide-react';
import { HandwritingCanvas } from './HandwritingCanvas';
import { CheckResult, LiveStudentSession } from '../types';

interface StudentViewProps {
  session: LiveStudentSession;
  updateSession: (updater: (prev: LiveStudentSession) => LiveStudentSession) => void;
  onLeaveClass?: () => void;
}

// Resilient fetch helper that handles transient network hiccups
async function safeApiPost<T = any>(url: string, payload: any, retries = 2): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return (await response.json()) as T;
      }
      
      const errData = await response.json().catch(() => null);
      if (errData && (errData.referenceSolution || errData.status)) {
        return errData as T;
      }
    } catch (err) {
      if (attempt === retries) {
        console.warn(`API call to ${url} failed:`, err);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  return null;
}

export const StudentView: React.FC<StudentViewProps> = ({ session, updateSession, onLeaveClass }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeCheckingRef = useRef(false);

  // Active Writing Timer (Tracks seconds while student is working)
  useEffect(() => {
    if (!session.hasStarted || session.solved) return;

    const timer = setInterval(() => {
      updateSession(prev => ({
        ...prev,
        secondsWriting: prev.secondsWriting + 1,
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [session.hasStarted, session.solved, updateSession]);

  // Periodic heartbeat to keep student marked online in teacher view
  useEffect(() => {
    if (!session.classCode || !session.studentId) return;

    const sendHeartbeat = () => {
      fetch(`/api/classes/${session.classCode}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: session.studentId,
          timeActiveSeconds: session.secondsWriting,
        }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [session.classCode, session.studentId, session.secondsWriting]);

  // Clean-up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  // Export 1024px max JPEG snapshot of canvas
  const getCanvasSnapshot = useCallback((): string | null => {
    if (!canvasRef.current) return null;
    const originalCanvas = canvasRef.current;
    const width = originalCanvas.width;
    const height = originalCanvas.height;
    if (width === 0 || height === 0) return null;

    const maxDimension = 1024;
    let targetWidth = width;
    let targetHeight = height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        targetWidth = maxDimension;
        targetHeight = Math.round((height * maxDimension) / width);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round((width * maxDimension) / height);
      }
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = targetWidth;
    offscreen.height = targetHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(originalCanvas, 0, 0, targetWidth, targetHeight);

    return offscreen.toDataURL('image/jpeg', 0.88);
  }, []);

  // Trigger Gemini API Check (with isManualCheck flag to respect line completion)
  const triggerCheck = useCallback(async (isManual = false) => {
    if (activeCheckingRef.current || !session.hasStarted) return;

    const snapshot = getCanvasSnapshot();
    if (!snapshot) return;

    activeCheckingRef.current = true;
    updateSession(prev => ({ ...prev, isChecking: true }));

    try {
      const result = await safeApiPost<CheckResult>('/api/check-solution', {
        imageBase64: snapshot,
        problem: session.problem,
        referenceSolution: session.referenceSolution || '',
        isManualCheck: isManual,
      });

      if (!result) {
        updateSession(prev => ({ ...prev, isChecking: false }));
        return;
      }

      updateSession(prev => {
        const isError = result.status === 'error';
        const isSolved = result.status === 'solved';

        let newHintsUsed = prev.hintsUsed;
        const newErrorTypes = [...prev.errorTypesEncountered];

        if (isError) {
          newHintsUsed += 1;
          if (result.error_type && !newErrorTypes.includes(result.error_type)) {
            newErrorTypes.push(result.error_type);
          }
        }

        // Send real-time event to class server for the Teacher View
        if (prev.classCode && prev.studentId) {
          fetch(`/api/classes/${prev.classCode}/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: prev.studentId,
              status: isSolved ? 'solved' : isError ? 'stuck' : 'working',
              mistakesCount: isError ? newErrorTypes.length : prev.errorTypesEncountered.length,
              errorTypes: newErrorTypes,
              hintsUsed: newHintsUsed,
              timeActiveSeconds: prev.secondsWriting,
              latestErrorType: result.error_type,
              latestHint: result.hint,
              solved: isSolved,
              solvedAlone: isSolved && newHintsUsed === 0,
            }),
          }).catch(() => {});
        }

        return {
          ...prev,
          isChecking: false,
          lastCheckResult: result,
          activeHint: isError ? result.hint : null,
          errorBox: isError ? result.error_box : null,
          errorType: isError ? result.error_type : null,
          hintsUsed: newHintsUsed,
          errorTypesEncountered: newErrorTypes,
          solved: isSolved,
          solvedAlone: isSolved && newHintsUsed === 0,
        };
      });
    } catch (err) {
      console.warn('Check notice:', err);
      updateSession(prev => ({ ...prev, isChecking: false }));
    } finally {
      activeCheckingRef.current = false;
    }
  }, [getCanvasSnapshot, session.hasStarted, session.problem, session.referenceSolution, updateSession]);

  // Handle stroke added: 4-second quiet background debounce before auto-check (no timer highlight)
  const handleStrokeAdded = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      triggerCheck(false);
    }, 4000);
  }, [triggerCheck]);

  // Clear current error state
  const handleClearError = useCallback(() => {
    updateSession(prev => ({
      ...prev,
      lastCheckResult: prev.lastCheckResult?.status === 'error' ? null : prev.lastCheckResult,
      activeHint: null,
      errorBox: null,
      errorType: null,
    }));
  }, [updateSession]);

  return (
    <div className="flex-1 flex flex-col space-y-4">
      {/* Top Problem Header Card (Clean & Unobstructed) */}
      <div className="bg-white border border-[#E5DEC9] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Class Badge & Problem (Subject) */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {session.classCode && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold font-mono px-2 py-0.5 rounded-md bg-[#D7263D]/10 text-[#D7263D] border border-[#D7263D]/20">
                <Hash className="w-3 h-3" />
                <span>Class: {session.classCode}</span>
              </span>
            )}
            {session.studentName && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                <User className="w-3 h-3 text-slate-500" />
                <span>{session.studentName}</span>
              </span>
            )}
            <span className="text-xs text-slate-400">• Problem</span>
          </div>

          <h2 className="font-mono text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            {session.problem}
          </h2>
        </div>

        {/* Right: Metrics & Leave Button */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono font-medium text-slate-600 bg-[#FAF8F5] border border-slate-200 px-3 py-1.5 rounded-xl">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatTime(session.secondsWriting)}</span>
          </div>

          {session.hintsUsed > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200">
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>{session.hintsUsed} {session.hintsUsed === 1 ? 'hint' : 'hints'}</span>
            </div>
          )}

          {onLeaveClass && (
            <button
              type="button"
              onClick={onLeaveClass}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Exit Class
            </button>
          )}
        </div>
      </div>

      {/* Solved Celebration Banner */}
      {session.solved && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-center justify-between text-emerald-900 animate-in fade-in zoom-in-95 duration-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              ✓
            </div>
            <div>
              <h4 className="font-bold text-base text-emerald-950">
                {session.solvedAlone ? 'Solved completely on your own! Outstanding!' : 'Great job solving the problem!'}
              </h4>
              <p className="text-xs text-emerald-800">
                Solved in {formatTime(session.secondsWriting)} with {session.hintsUsed} {session.hintsUsed === 1 ? 'hint' : 'hints'}. Teacher dashboard updated.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-800 bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
            Problem Complete ★
          </span>
        </div>
      )}

      {/* Workspace: Canvas + Side Teacher Margin */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 items-stretch min-h-[580px]">
        {/* Interactive Handwriting Canvas (moved slightly to create a comfortable spot for hint) */}
        <div className="flex-1 flex flex-col relative min-h-[560px] min-w-0">
          <HandwritingCanvas
            onStrokeAdded={handleStrokeAdded}
            onCheckNow={() => triggerCheck(true)}
            isChecking={session.isChecking}
            checkResult={session.lastCheckResult}
            onClearError={handleClearError}
            canvasRef={canvasRef}
            getCanvasSnapshot={getCanvasSnapshot}
          />
        </div>

        {/* Dedicated Side Spot for Teacher Hint (simple, comfortable, authentic paper style) */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col">
          {session.activeHint ? (
            /* Active Teacher Socratic Hint Card */
            <div className="bg-[#FFFBFB] border-2 border-[#D7263D]/25 rounded-2xl p-5 shadow-xs flex flex-col justify-between h-full animate-in fade-in duration-200">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[#D7263D]/15">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#D7263D]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#D7263D]">
                      Teacher's Note
                    </span>
                  </div>
                  {session.errorType && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-[#D7263D]/10 text-[#D7263D]">
                      {session.errorType}
                    </span>
                  )}
                </div>

                <p className="font-caveat text-2xl sm:text-3xl font-bold text-[#D7263D] leading-snug mb-3">
                  "{session.activeHint}"
                </p>

                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  The first mistake is circled in red on your notebook paper. Erase or rewrite that step to fix it.
                </p>
              </div>

              <div className="pt-4 border-t border-[#D7263D]/15 mt-4 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Step-by-step guidance
                </span>
                <button
                  type="button"
                  onClick={handleClearError}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                >
                  Dismiss note
                </button>
              </div>
            </div>
          ) : (
            /* Quiet Companion Margin */
            <div className="bg-[#FAF8F5] border border-dashed border-[#E5DEC9] rounded-2xl p-5 flex flex-col justify-between h-full text-slate-500">
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-[#E5DEC9]/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Teacher's Margin
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Write each line of your algebraic solution on the lined paper.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  When you move to the next string, your previous step is checked quietly. If you make a mistake, a Socratic hint will appear right here in this spot.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200/60 mt-4 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Working quietly</span>
                <span className="text-slate-400 font-mono">4s auto-check</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { PenTool, GraduationCap, Sparkles, BookOpen, Home, ArrowLeft } from 'lucide-react';
import { StartScreen } from './components/StartScreen';
import { TeacherSetupModal } from './components/TeacherSetupModal';
import { TeacherDashboard } from './components/TeacherDashboard';
import { StudentView } from './components/StudentView';
import { LiveStudentSession } from './types';

type AppScreen = 'start' | 'teacher_view' | 'student_view';

export function App() {
  const [screen, setScreen] = useState<AppScreen>('start');
  const [showTeacherSetup, setShowTeacherSetup] = useState(false);
  const [activeClassCode, setActiveClassCode] = useState<string>('');
  const [initialJoinCode, setInitialJoinCode] = useState<string>('');

  // Live student session state
  const [studentSession, setStudentSession] = useState<LiveStudentSession>({
    problem: "Solve for x: 3(x - 2) + 4 = 2x + 7",
    referenceSolution: null,
    hasStarted: true,
    secondsWriting: 0,
    hintsUsed: 0,
    errorTypesEncountered: [],
    solved: false,
    solvedAlone: false,
    lastCheckResult: null,
    activeHint: null,
    errorBox: null,
    errorType: null,
    isChecking: false,
    canvasIsEmpty: true,
  });

  // Check URL query parameters for ?code=ABC123
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const codeParam = params.get('code');
      if (codeParam && codeParam.trim()) {
        setInitialJoinCode(codeParam.trim().toUpperCase());
      }
    } catch {}
  }, []);

  // Teacher launches class from setup modal
  const handleTeacherClassReady = (code: string, problem: string) => {
    setActiveClassCode(code);
    setShowTeacherSetup(false);
    setScreen('teacher_view');
  };

  // Student joins class with code & name
  const handleStudentJoin = async (code: string, name: string) => {
    try {
      const res = await fetch(`/api/classes/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Failed to join class');
      }

      const data = await res.json();
      setActiveClassCode(code);
      setStudentSession({
        classCode: code,
        studentId: data.studentId,
        studentName: name,
        problem: data.problem || "Solve for x: 3(x - 2) + 4 = 2x + 7",
        problemImageUrl: data.problemImageUrl,
        referenceSolution: data.referenceSolution || null,
        hasStarted: true,
        secondsWriting: 0,
        hintsUsed: 0,
        errorTypesEncountered: [],
        solved: false,
        solvedAlone: false,
        lastCheckResult: null,
        activeHint: null,
        errorBox: null,
        errorType: null,
        isChecking: false,
        canvasIsEmpty: true,
      });

      setScreen('student_view');
    } catch (e: any) {
      alert(e.message || 'Could not join class');
    }
  };

  const handleReturnHome = () => {
    setScreen('start');
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 flex flex-col font-sans-app antialiased selection:bg-[#D7263D]/20 selection:text-[#D7263D]">
      {/* Universal Top Header */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#E5DEC9]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div 
            onClick={handleReturnHome}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#D7263D] flex items-center justify-center text-white shadow-sm ring-2 ring-[#D7263D]/20 group-hover:scale-105 transition-transform">
              <PenTool className="w-5 h-5 -rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  Red Pen
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-[#D7263D]/10 text-[#D7263D]">
                  Live Classroom
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Real-time AI handwriting Socratic teacher
              </p>
            </div>
          </div>

          {/* Right Navigation / Current Mode Indicators */}
          <div className="flex items-center gap-3">
            {screen === 'teacher_view' && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold font-mono">
                  <GraduationCap className="w-3.5 h-3.5 text-[#D7263D]" />
                  <span>Teacher: {activeClassCode}</span>
                </span>
                <button
                  type="button"
                  onClick={handleReturnHome}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-200/60 transition-colors"
                >
                  Exit Class
                </button>
              </div>
            )}

            {screen === 'student_view' && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold font-mono">
                  <PenTool className="w-3.5 h-3.5 text-emerald-600 -rotate-45" />
                  <span>{studentSession.studentName || 'Student'} ({activeClassCode})</span>
                </span>
                <button
                  type="button"
                  onClick={handleReturnHome}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-200/60 transition-colors"
                >
                  Exit Class
                </button>
              </div>
            )}

            {screen === 'start' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTeacherSetup(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#D7263D] hover:bg-[#bd1f33] text-white shadow-xs transition-all"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Create Class</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Dynamic View */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {screen === 'start' && (
          <StartScreen
            onSelectTeacherCreate={() => setShowTeacherSetup(true)}
            onJoinStudent={handleStudentJoin}
            initialCode={initialJoinCode}
          />
        )}

        {screen === 'teacher_view' && (
          <TeacherDashboard
            classCode={activeClassCode}
            onExit={handleReturnHome}
          />
        )}

        {screen === 'student_view' && (
          <StudentView
            session={studentSession}
            updateSession={setStudentSession}
            onLeaveClass={handleReturnHome}
          />
        )}
      </main>

      {/* Teacher Class Setup & Problem Upload Modal */}
      {showTeacherSetup && (
        <TeacherSetupModal
          onClassReady={handleTeacherClassReady}
          onCancel={() => setShowTeacherSetup(false)}
        />
      )}

      {/* Footer */}
      <footer className="py-4 border-t border-[#E5DEC9] text-center text-xs text-slate-400">
        <p className="flex items-center justify-center gap-1.5">
          <span>Red Pen AI</span>
          <span>•</span>
          <span>Shared classroom state & real-time handwriting vision</span>
          <span>•</span>
          <span className="text-emerald-700 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Gemini Vision
          </span>
        </p>
      </footer>
    </div>
  );
}

export default App;

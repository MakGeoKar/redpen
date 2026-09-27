import React, { useState } from 'react';
import { 
  GraduationCap, 
  PenTool, 
  ArrowRight, 
  Sparkles, 
  Upload, 
  Camera, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Hash,
  User,
  BookOpen
} from 'lucide-react';

interface StartScreenProps {
  onSelectTeacherCreate: () => void;
  onJoinStudent: (code: string, name: string) => void;
  initialCode?: string;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  onSelectTeacherCreate,
  onJoinStudent,
  initialCode = '',
}) => {
  const [activeModal, setActiveModal] = useState<'none' | 'join'>('none');
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [joinName, setJoinName] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    const cleanName = joinName.trim();

    if (!cleanCode || cleanCode.length < 4) {
      setJoinError('Please enter a valid 6-character class code.');
      return;
    }
    if (!cleanName) {
      setJoinError('Please enter your name.');
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      // Validate that class exists on backend before proceeding
      const res = await fetch(`/api/classes/${cleanCode}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Class code "${cleanCode}" was not found. Please ask your teacher for the code.`);
      }
      onJoinStudent(cleanCode, cleanName);
    } catch (err: any) {
      setJoinError(err.message || 'Could not connect to class.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 max-w-4xl mx-auto w-full">
      {/* Brand Hero */}
      <div className="text-center mb-10 max-w-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D7263D]/10 text-[#D7263D] text-xs font-bold tracking-wide uppercase mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Real-Time Math Teaching Engine</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-3">
          Welcome to <span className="text-[#D7263D]">Red Pen</span>
        </h1>
        <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
          Students write math steps by hand on digital notebook paper. 
          Red Pen watches line by line, catches mistakes on the spot, and helps teachers track the entire classroom live.
        </p>
      </div>

      {/* Main Choice Cards: Teacher vs Student */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mb-8">
        {/* CREATE A CLASS (Teacher) */}
        <div 
          onClick={onSelectTeacherCreate}
          className="group relative bg-white border-2 border-[#E5DEC9] hover:border-[#D7263D] rounded-2xl p-6 sm:p-7 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="w-13 h-13 rounded-2xl bg-amber-50 group-hover:bg-[#D7263D]/10 border border-amber-200 group-hover:border-[#D7263D]/30 flex items-center justify-center text-[#D7263D] mb-5 transition-colors">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded">
                For Teachers
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Create a class
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Post a problem as text or snap a photo from your textbook. 
              Get a 6-character code and monitor all students' handwriting, mistakes, and hints in real time.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm font-bold text-[#D7263D] group-hover:translate-x-1 transition-transform">
            <span>Set up class & upload problem</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* JOIN A CLASS (Student) */}
        <div 
          onClick={() => setActiveModal('join')}
          className="group relative bg-white border-2 border-[#E5DEC9] hover:border-emerald-500 rounded-2xl p-6 sm:p-7 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="w-13 h-13 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100/60 border border-emerald-200 group-hover:border-emerald-300 flex items-center justify-center text-emerald-700 mb-5 transition-colors">
              <PenTool className="w-7 h-7 -rotate-45" />
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                For Students
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Join a class
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Have a class code? Enter it with your name to open your digital ruled notebook. 
              Write your solution with real-time feedback and Socratic hints.
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 group-hover:translate-x-1 transition-transform">
            <span>Enter code & open notebook</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Quick Demo Hint */}
      <div className="text-center text-xs text-slate-500 max-w-md bg-[#F4EFEA] border border-[#E5DEC9] px-4 py-2.5 rounded-xl">
        <span className="font-semibold text-slate-700">Quick Test:</span> Default code <span className="font-mono font-bold text-[#D7263D] bg-white px-1.5 py-0.5 rounded border border-slate-200">MATH24</span> is already prepared for instant testing.
      </div>

      {/* STUDENT JOIN MODAL */}
      {activeModal === 'join' && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <PenTool className="w-5 h-5 -rotate-45" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Join Math Class</h3>
                  <p className="text-xs text-slate-500">Enter code provided by your teacher</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal('none');
                  setJoinError(null);
                }}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Class Code (6 characters)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    maxLength={8}
                    value={joinCode}
                    onChange={(e) => {
                      setJoinCode(e.target.value.toUpperCase());
                      setJoinError(null);
                    }}
                    placeholder="e.g. MATH24"
                    className="w-full pl-10 pr-4 py-3 bg-[#FAF8F5] border border-slate-300 rounded-xl font-mono text-base font-bold tracking-widest text-slate-900 placeholder:text-slate-400 placeholder:font-normal placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white uppercase"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Your Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    maxLength={30}
                    value={joinName}
                    onChange={(e) => {
                      setJoinName(e.target.value);
                      setJoinError(null);
                    }}
                    placeholder="e.g. Maya Chen"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              {joinError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{joinError}</span>
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal('none');
                    setJoinError(null);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoining}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isJoining ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <span>Open Notebook</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

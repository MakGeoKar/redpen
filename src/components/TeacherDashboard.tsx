import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, 
  Lightbulb, 
  Sparkles, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  HelpCircle, 
  RefreshCw,
  Copy,
  Check,
  Edit3,
  ExternalLink,
  BookOpen,
  ArrowUpRight
} from 'lucide-react';
import { ClassData, RealClassStudent } from '../types';
import { TeacherSetupModal } from './TeacherSetupModal';

interface TeacherDashboardProps {
  classCode: string;
  onExit: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ classCode, onExit }) => {
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isCopiedLink, setIsCopiedLink] = useState(false);
  const [showEditProblemModal, setShowEditProblemModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'working' | 'solved' | 'stuck'>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch real class data from server
  const fetchClassData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/classes/${classCode}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Class ${classCode} not found`);
      }
      const data: ClassData = await res.json();
      setClassData(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not fetch class data');
    } finally {
      setIsLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, [classCode]);

  // Polling every 3 seconds for live student progress updates
  useEffect(() => {
    fetchClassData();
    const interval = setInterval(() => {
      fetchClassData();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchClassData]);

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  // Copy class code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(classCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Copy direct student join link to clipboard
  const handleCopyLink = () => {
    const url = `${window.location.origin}/?code=${classCode}`;
    navigator.clipboard.writeText(url);
    setIsCopiedLink(true);
    setTimeout(() => setIsCopiedLink(false), 2000);
  };

  // Real aggregate statistics calculated strictly from joined students
  const stats = useMemo(() => {
    const students = classData?.students || [];
    const total = students.length;
    const solvedCount = students.filter(s => s.status === 'solved' || s.solved).length;
    const stuckCount = students.filter(s => s.status === 'stuck').length;
    const workingCount = students.filter(s => s.status === 'working' && !s.solved).length;
    const activeOnlineCount = students.filter(s => s.isOnline).length;

    // Error type frequencies
    const errorCounts: Record<string, number> = {
      sign: 0,
      arithmetic: 0,
      algebra: 0,
      concept: 0,
    };

    students.forEach(s => {
      s.errorTypes?.forEach(err => {
        if (err in errorCounts) {
          errorCounts[err] = (errorCounts[err] || 0) + 1;
        }
      });
    });

    // Top misconception
    const topErrorEntry = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0];
    const topError = topErrorEntry && topErrorEntry[1] > 0 ? topErrorEntry : null;

    const totalHints = students.reduce((acc, s) => acc + (s.hintsUsed || 0), 0);
    const avgSeconds = total > 0 
      ? Math.round(students.reduce((acc, s) => acc + (s.timeActiveSeconds || 0), 0) / total) 
      : 0;

    return {
      total,
      solvedCount,
      stuckCount,
      workingCount,
      activeOnlineCount,
      solvedRate: total > 0 ? Math.round((solvedCount / total) * 100) : 0,
      errorCounts,
      topError,
      totalHints,
      avgSeconds,
    };
  }, [classData?.students]);

  // Filtered real students
  const filteredStudents = useMemo(() => {
    const students = classData?.students || [];
    return students.filter(student => {
      const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'All' || student.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [classData?.students, searchQuery, statusFilter]);

  if (isLoading && !classData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12">
        <span className="w-8 h-8 border-3 border-[#D7263D]/20 border-t-[#D7263D] rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Connecting to live class {classCode}...</p>
      </div>
    );
  }

  if (error && !classData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Could Not Load Class</h2>
        <p className="text-sm text-slate-600 mb-5">{error}</p>
        <button
          onClick={onExit}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col space-y-5 animate-in fade-in duration-150">
      {/* Top Banner: Class Code & Problem Management */}
      <div className="bg-white border border-[#E5DEC9] rounded-2xl p-5 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left: Class Code & Status */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-0.5">
              Class Invite Code
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-[#D7263D] bg-[#D7263D]/10 px-3 py-1 rounded-xl border border-[#D7263D]/20">
                {classCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                title="Copy class code"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                title="Copy student invite link"
              >
                {isCopiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>{isCopiedLink ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden sm:block mx-1" />

          {/* Active Live Pulse */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live Class Active</span>
            <span className="text-[10px] text-emerald-600 bg-emerald-100/70 px-1.5 py-0.2 rounded font-mono">
              Auto-sync 3s
            </span>
          </div>
        </div>

        {/* Right: Current Problem & Edit Button */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Current Target Problem
            </span>
            <span className="font-mono text-xs font-semibold text-slate-800 max-w-xs truncate block">
              {classData?.problem || 'No problem assigned'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowEditProblemModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#FAF8F5] hover:bg-white text-slate-800 border border-slate-300 hover:border-[#D7263D] transition-colors shadow-2xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#D7263D]" />
            <span>Change Problem</span>
          </button>
        </div>
      </div>

      {/* Problem Display Bar (Mobile & Tablet) */}
      <div className="bg-[#F4EFEA] border border-[#E5DEC9] rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs sm:hidden">
        <div>
          <span className="font-bold text-slate-500 block text-[10px] uppercase">Problem:</span>
          <span className="font-mono font-semibold text-slate-900">{classData?.problem}</span>
        </div>
        <button
          onClick={() => setShowEditProblemModal(true)}
          className="text-[#D7263D] font-bold underline shrink-0"
        >
          Edit
        </button>
      </div>

      {/* Real Aggregate Class Metrics (4 Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Total Joined Students */}
        <div className="bg-white border border-[#E5DEC9] p-4 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Students</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {stats.activeOnlineCount} online
            </span>
          </div>
        </div>

        {/* Solved Count & Rate */}
        <div className="bg-white border border-[#E5DEC9] p-4 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Solved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-700">{stats.solvedCount}</span>
            <span className="text-xs text-slate-500">
              ({stats.solvedRate}% rate)
            </span>
          </div>
        </div>

        {/* Stuck / Needs Help */}
        <div className="bg-white border border-[#E5DEC9] p-4 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Needs Help</span>
            <AlertCircle className="w-4 h-4 text-[#D7263D]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${stats.stuckCount > 0 ? 'text-[#D7263D]' : 'text-slate-800'}`}>
              {stats.stuckCount}
            </span>
            <span className="text-xs text-slate-500">
              students stuck
            </span>
          </div>
        </div>

        {/* Top Misconception */}
        <div className="bg-white border border-[#E5DEC9] p-4 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Top Misconception</span>
            <HelpCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            {stats.topError ? (
              <>
                <span className="text-base font-bold text-slate-900 capitalize">
                  {stats.topError[0]}
                </span>
                <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                  {stats.topError[1]} made
                </span>
              </>
            ) : (
              <span className="text-sm font-semibold text-slate-400">None yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Real Socratic Lesson Planning Box: "What to explain tomorrow" */}
      <div className="bg-white border border-[#E5DEC9] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-2 text-slate-900">
          <Lightbulb className="w-5 h-5 text-amber-500 fill-amber-400" />
          <h3 className="font-extrabold text-sm sm:text-base">
            What to explain tomorrow
          </h3>
          <span className="text-[10px] font-bold text-[#D7263D] bg-[#D7263D]/10 px-2 py-0.5 rounded-full uppercase">
            Live Synthesis
          </span>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed font-medium">
          {classData?.teacherSummary || (
            stats.total === 0
              ? "Waiting for students to join with code " + classCode + ". Common errors and misconceptions will be synthesized here live."
              : stats.topError
                ? `${stats.topError[1]} students are currently struggling with ${stats.topError[0]} errors — review this misconception with the class tomorrow.`
                : "All active students are progressing cleanly without repeating error patterns."
          )}
        </p>
      </div>

      {/* Real Student Roster / Live Activity */}
      <div className="bg-white border border-[#E5DEC9] rounded-2xl shadow-xs overflow-hidden flex-1 flex flex-col">
        {/* Roster Controls: Search & Status Filters */}
        <div className="p-4 border-b border-[#E5DEC9] bg-[#FAF8F5] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <h3 className="font-extrabold text-sm text-slate-900 whitespace-nowrap">
              Students in Class ({stats.total})
            </h3>
            <button
              onClick={() => fetchClassData(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white transition-colors"
              title="Refresh student data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#D7263D]' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {/* Search Box */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student..."
                className="w-full sm:w-44 pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#D7263D]"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none"
            >
              <option value="All">All statuses</option>
              <option value="working">Working</option>
              <option value="solved">Solved</option>
              <option value="stuck">Needs Help</option>
            </select>
          </div>
        </div>

        {/* Real Student Table / Empty State */}
        {stats.total === 0 ? (
          /* EMPTY STATE (No fake data) */
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mb-4 shadow-2xs">
              <Users className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-slate-900 mb-1">
              Class Ready! Share Code: <span className="font-mono text-[#D7263D]">{classCode}</span>
            </h4>
            <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
              Ask your students to open this website and tap <strong className="text-slate-800">"Join a class"</strong> with code <strong className="font-mono text-[#D7263D]">{classCode}</strong>.
              As they join, their real-time handwriting progress and mistakes will appear here instantly.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 transition-all"
              >
                {isCopiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{isCopiedLink ? 'Invite Link Copied!' : 'Copy Student Invite Link'}</span>
              </button>
              <button
                type="button"
                onClick={() => fetchClassData(true)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-all"
              >
                Check for Students
              </button>
            </div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No students match your filter "{searchQuery}".
          </div>
        ) : (
          /* REAL STUDENTS ROSTER TABLE */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Mistakes</th>
                  <th className="py-3 px-4">Error Types</th>
                  <th className="py-3 px-4">Hints</th>
                  <th className="py-3 px-4">Active Time</th>
                  <th className="py-3 px-4">Current AI Guidance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Student Name & Online Indicator */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs uppercase">
                            {student.name.slice(0, 2)}
                          </div>
                          {student.isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="Active on canvas now" />
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block">{student.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {student.isOnline ? 'Online now' : 'Idle'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Progress Status Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {student.status === 'solved' || student.solved ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Solved {student.solvedAlone ? 'alone' : 'with hints'}</span>
                        </span>
                      ) : student.status === 'stuck' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200 animate-pulse">
                          <AlertCircle className="w-3.5 h-3.5 text-[#D7263D]" />
                          <span>Needs Help</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Working</span>
                        </span>
                      )}
                    </td>

                    {/* Mistakes Count */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono font-bold text-slate-700">
                      {student.mistakesCount > 0 ? (
                        <span className="text-[#D7263D]">{student.mistakesCount}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Error Types Badges */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {student.errorTypes && student.errorTypes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {student.errorTypes.map((err, i) => (
                            <span 
                              key={i} 
                              className="px-1.5 py-0.5 rounded bg-rose-100/70 text-rose-800 font-mono text-[10px] font-bold capitalize"
                            >
                              {err}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Clean work</span>
                      )}
                    </td>

                    {/* Hints Used */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700">
                      {student.hintsUsed || 0}
                    </td>

                    {/* Active Time */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-600">
                      {formatTime(student.timeActiveSeconds || 0)}
                    </td>

                    {/* Current Socratic Hint */}
                    <td className="py-3 px-4 max-w-xs">
                      {student.latestHint ? (
                        <span className="text-[11px] text-slate-600 italic block truncate" title={student.latestHint}>
                          "{student.latestHint}"
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Problem Modal */}
      {showEditProblemModal && (
        <TeacherSetupModal
          initialCode={classCode}
          initialProblem={classData?.problem}
          onClassReady={(code, newProblem) => {
            setShowEditProblemModal(false);
            fetchClassData(true);
          }}
          onCancel={() => setShowEditProblemModal(false)}
        />
      )}
    </div>
  );
};

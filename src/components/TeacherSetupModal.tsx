import React, { useState } from 'react';
import { 
  GraduationCap, 
  Upload, 
  Camera, 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';

interface TeacherSetupModalProps {
  initialCode?: string;
  initialProblem?: string;
  onClassReady: (code: string, problem: string) => void;
  onCancel: () => void;
}

const PRESET_PROBLEMS = [
  "Solve for x: 3(x - 2) + 4 = 2x + 7",
  "Solve for x: 5(2x - 3) - 7 = 3x + 6",
  "Solve for x: 4 - 2(x - 5) = 3x + 9",
  "Solve for x: 2(4x + 1) - 10 = 5(x - 1)",
  "Solve for x: 7 - 3(2x - 4) = 4x + 1",
];

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const TeacherSetupModal: React.FC<TeacherSetupModalProps> = ({
  initialCode,
  initialProblem,
  onClassReady,
  onCancel,
}) => {
  const [code, setCode] = useState<string>(initialCode || generateRandomCode());
  const [problemMode, setProblemMode] = useState<'text' | 'photo'>('text');
  const [problemText, setProblemText] = useState<string>(
    initialProblem || "Solve for x: 3(x - 2) + 4 = 2x + 7"
  );
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Handle image upload from computer or tablet camera
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPEG, etc.)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setPhotoBase64(dataUrl);
      setPhotoPreview(dataUrl);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleLaunchClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problemMode === 'text' && !problemText.trim()) {
      setError('Please type a math problem or choose a preset.');
      return;
    }
    if (problemMode === 'photo' && !photoBase64) {
      setError('Please upload or snap a photo of the problem.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage('Analyzing problem & generating teacher reference solution with Gemini...');

    try {
      const response = await fetch('/api/classes/create-or-update-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          problemText: problemMode === 'text' ? problemText.trim() : undefined,
          problemImageBase64: problemMode === 'photo' ? photoBase64 : undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to create class');
      }

      const data = await response.json();
      onClassReady(data.code, data.problem);
    } catch (err: any) {
      setError(err.message || 'Error creating class');
      setIsLoading(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-8">
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D7263D]/10 border border-[#D7263D]/20 flex items-center justify-center text-[#D7263D]">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {initialCode ? 'Update Class Problem' : 'Create a Live Class'}
              </h2>
              <p className="text-xs text-slate-500">
                Upload a problem for your students to solve with real-time AI checking
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleLaunchClass} className="space-y-5">
          {/* Class Code Generator / Display */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Class Code (Share with students)
              </label>
              {!initialCode && (
                <button
                  type="button"
                  onClick={() => setCode(generateRandomCode())}
                  className="text-xs text-[#D7263D] hover:underline flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Generate new</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-slate-300 rounded-xl font-mono text-lg font-bold tracking-widest text-[#D7263D] uppercase focus:outline-none focus:ring-2 focus:ring-[#D7263D] focus:bg-white"
                placeholder="ABC123"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Students will type this 6-letter code to join your classroom.
            </p>
          </div>

          {/* Problem Input Mode Tabs: Text vs Photo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Problem Source
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F4EFEA] border border-[#E5DEC9] rounded-xl mb-3">
              <button
                type="button"
                onClick={() => setProblemMode('text')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  problemMode === 'text'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4 text-[#D7263D]" />
                <span>Text / Template</span>
              </button>
              <button
                type="button"
                onClick={() => setProblemMode('photo')}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                  problemMode === 'photo'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-4 h-4 text-[#D7263D]" />
                <span>Photo of Problem</span>
              </button>
            </div>

            {/* Mode 1: Text Input */}
            {problemMode === 'text' ? (
              <div className="space-y-3">
                <textarea
                  rows={2}
                  value={problemText}
                  onChange={(e) => setProblemText(e.target.value)}
                  placeholder="e.g. Solve for x: 3(x - 2) + 4 = 2x + 7"
                  className="w-full p-3 bg-[#FAF8F5] border border-slate-300 rounded-xl font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D7263D] focus:bg-white"
                />

                {/* Preset suggestions */}
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                    Or click a preset problem:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_PROBLEMS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setProblemText(preset)}
                        className={`text-xs px-2.5 py-1 rounded-lg border text-left transition-all ${
                          problemText === preset
                            ? 'bg-[#D7263D]/10 border-[#D7263D] text-[#D7263D] font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {preset.replace('Solve for x: ', '')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Mode 2: Photo Upload */
              <div className="space-y-3">
                <div className="border-2 border-dashed border-slate-300 hover:border-[#D7263D] rounded-2xl p-6 text-center transition-colors bg-[#FAF8F5]">
                  {photoPreview ? (
                    <div className="flex flex-col items-center">
                      <img 
                        src={photoPreview} 
                        alt="Problem preview" 
                        className="max-h-40 rounded-lg shadow-sm border border-slate-200 mb-3 object-contain"
                      />
                      <label className="cursor-pointer text-xs font-bold text-[#D7263D] hover:underline">
                        Change photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-xl bg-[#D7263D]/10 text-[#D7263D] flex items-center justify-center mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-bold text-slate-800 mb-1">
                        Upload or snap a photo of a problem
                      </span>
                      <span className="text-xs text-slate-500 max-w-xs mb-3">
                        Take a photo of a textbook, worksheet, or whiteboard equation. Gemini will OCR and solve it automatically.
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Select image file</span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status / Loading / Error Notice */}
          {statusMessage && (
            <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs animate-pulse">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 animate-spin" />
              <span>{statusMessage}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#D7263D] hover:bg-[#bd1f33] text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing Problem...</span>
                </>
              ) : (
                <>
                  <span>{initialCode ? 'Update Class Problem' : 'Launch Class & Watch Live'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

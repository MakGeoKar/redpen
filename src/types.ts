export type ErrorType = 'sign' | 'arithmetic' | 'algebra' | 'concept' | null;

export type StudentProgressStatus = 'working' | 'solved' | 'stuck';

export interface CheckResult {
  status: 'on_track' | 'error' | 'solved';
  error_box: [number, number, number, number] | null; // [ymin, xmin, ymax, xmax] 0-1000
  error_type: ErrorType;
  confidence: number;
  hint: string | null;
}

export interface RealClassStudent {
  id: string;
  name: string;
  joinedAt: number;
  lastActive: number;
  status: StudentProgressStatus;
  mistakesCount: number;
  errorTypes: string[];
  hintsUsed: number;
  timeActiveSeconds: number;
  latestErrorType: string | null;
  latestHint: string | null;
  solved: boolean;
  solvedAlone: boolean;
  isOnline: boolean;
}

export interface ClassData {
  code: string;
  createdAt: number;
  problem: string;
  problemImageUrl: string | null;
  hasReferenceSolution: boolean;
  studentCount: number;
  students: RealClassStudent[];
  teacherSummary?: string;
}

export interface LiveStudentSession {
  classCode?: string;
  studentId?: string;
  studentName?: string;
  problem: string;
  problemImageUrl?: string | null;
  referenceSolution: string | null;
  hasStarted: boolean;
  secondsWriting: number;
  hintsUsed: number;
  errorTypesEncountered: ('sign' | 'arithmetic' | 'algebra' | 'concept')[];
  solved: boolean;
  solvedAlone: boolean;
  lastCheckResult: CheckResult | null;
  activeHint: string | null;
  errorBox: [number, number, number, number] | null;
  errorType: ErrorType;
  isChecking: boolean;
  canvasIsEmpty: boolean;
}

import express from 'express';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as vite from 'vite';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Enable CORS for all origins, handling preflight OPTIONS requests cleanly
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

// In-Memory Shared State Storage
interface StudentRecord {
  id: string;
  name: string;
  joinedAt: number;
  lastActive: number;
  status: 'working' | 'solved' | 'stuck';
  mistakesCount: number;
  errorTypes: string[];
  hintsUsed: number;
  timeActiveSeconds: number;
  latestErrorType: string | null;
  latestHint: string | null;
  solved: boolean;
  solvedAlone: boolean;
}

interface ClassSession {
  code: string;
  createdAt: number;
  problem: string;
  problemImageUrl: string | null;
  referenceSolution: string;
  students: Record<string, StudentRecord>;
}

const classesStore = new Map<string, ClassSession>();

// Seed an initial demo class so anyone can try with a default code right away
const DEFAULT_CLASS_CODE = "MATH24";
classesStore.set(DEFAULT_CLASS_CODE, {
  code: DEFAULT_CLASS_CODE,
  createdAt: Date.now(),
  problem: "Solve for x: 3(x - 2) + 4 = 2x + 7",
  problemImageUrl: null,
  referenceSolution: "3x - 6 + 4 = 2x + 7 => 3x - 2 = 2x + 7 => x = 9",
  students: {},
});

function generateClassCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (classesStore.has(code));
  return code;
}

// Robust caller with automatic failover across models to prevent 429 quota exhaustion
async function callGeminiWithFailover(options: { contents: any[]; config?: any }) {
  const models = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });

      if (response && response.text) {
        return response.text;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} encountered error (${err.status || err.message}). Failing over to alternative...`);
    }
  }

  throw lastError || new Error('All vision models failed');
}

// 1. Solve Problem Silently (Hidden reference solution generator)
async function generateReferenceSolution(problem: string): Promise<string> {
  try {
    const text = await callGeminiWithFailover({
      contents: [{
        role: 'user',
        parts: [{
          text: `You are an expert math educator. Solve this math problem step by step clearly, showing each line of algebra and the final answer. Keep it concise. This is a private reference solution for an automated grading system.
Problem: ${problem}`
        }]
      }],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });
    return text.trim();
  } catch (e: any) {
    console.error('Error generating reference solution:', e);
    return `Step 1: Simplify brackets. Step 2: Group variable terms on left, constant terms on right. Step 3: Solve for x.`;
  }
}

app.post('/api/solve-reference', async (req, res) => {
  const { problem } = req.body || {};
  if (!problem || typeof problem !== 'string') {
    return res.status(400).json({ error: 'Problem statement required' });
  }
  const referenceSolution = await generateReferenceSolution(problem);
  res.json({ referenceSolution });
});

// 2. Create or Update a Class (Teacher uploads text or photo)
app.post('/api/classes/create-or-update-problem', async (req, res) => {
  try {
    const { code, problemText, problemImageBase64 } = req.body || {};
    let targetCode = (code ? String(code).trim().toUpperCase() : generateClassCode());
    if (targetCode.length < 4) {
      targetCode = generateClassCode();
    }

    let extractedProblem = problemText ? String(problemText).trim() : '';
    let problemImageUrl: string | null = null;

    // If teacher uploaded a photo of a problem, use Gemini Vision to transcribe it
    if (problemImageBase64) {
      const cleanBase64 = problemImageBase64.replace(/^data:image\/\w+;base64,/, '');
      problemImageUrl = problemImageBase64.startsWith('data:image') 
        ? problemImageBase64.slice(0, 100) + '...' // store thumbnail/flag
        : null;

      const visionText = await callGeminiWithFailover({
        contents: [{
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64,
              }
            },
            {
              text: `Transcribe the math problem shown in this photo clearly into a single clean math equation or problem statement (e.g. "Solve for x: 3(x - 2) + 4 = 2x + 7").
Return JSON only:
{
  "problem": "exact transcribed problem statement"
}`
            }
          ]
        }],
        config: { responseMimeType: "application/json" }
      });

      try {
        let clean = visionText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        const parsed = JSON.parse(clean);
        if (parsed.problem) {
          extractedProblem = parsed.problem;
        }
      } catch {
        if (!extractedProblem) {
          extractedProblem = "Solve for x: 3(x - 2) + 4 = 2x + 7";
        }
      }
    }

    if (!extractedProblem) {
      extractedProblem = "Solve for x: 3(x - 2) + 4 = 2x + 7";
    }

    // Solve problem silently to produce hidden reference solution
    const referenceSolution = await generateReferenceSolution(extractedProblem);

    let session = classesStore.get(targetCode);
    if (session) {
      session.problem = extractedProblem;
      session.problemImageUrl = problemImageUrl;
      session.referenceSolution = referenceSolution;
    } else {
      session = {
        code: targetCode,
        createdAt: Date.now(),
        problem: extractedProblem,
        problemImageUrl,
        referenceSolution,
        students: {},
      };
      classesStore.set(targetCode, session);
    }

    res.json({
      success: true,
      code: session.code,
      problem: session.problem,
      problemImageUrl: session.problemImageUrl,
      hasReferenceSolution: true,
    });
  } catch (error: any) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: error.message || 'Failed to create class' });
  }
});

// 3. Get Class Data (Live Teacher View polling)
app.get('/api/classes/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const session = classesStore.get(code);

  if (!session) {
    return res.status(404).json({ error: `Class code ${code} not found` });
  }

  const now = Date.now();
  const studentList = Object.values(session.students).map(s => ({
    ...s,
    // Active if sent a heartbeat/event in the last 20 seconds
    isOnline: now - s.lastActive < 20000,
  }));

  // Generate dynamic teacher explanation insight if students have errors
  let teacherSummary: string | undefined = undefined;
  const allErrors = studentList.flatMap(s => s.errorTypes);
  if (allErrors.length > 0) {
    const counts: Record<string, number> = {};
    allErrors.forEach(e => counts[e] = (counts[e] || 0) + 1);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topError = sorted[0];
    const affectedCount = studentList.filter(s => s.errorTypes.includes(topError[0])).length;
    teacherSummary = `${affectedCount} of ${studentList.length} students made ${topError[0]} errors — review this misconception with the class tomorrow.`;
  }

  res.json({
    code: session.code,
    createdAt: session.createdAt,
    problem: session.problem,
    problemImageUrl: session.problemImageUrl,
    hasReferenceSolution: !!session.referenceSolution,
    studentCount: studentList.length,
    students: studentList,
    teacherSummary,
  });
});

// 4. Student Joins Class
app.post('/api/classes/:code/join', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const { name, studentId: existingId } = req.body || {};

  const session = classesStore.get(code);
  if (!session) {
    return res.status(404).json({ error: `Class code ${code} does not exist. Please check with your teacher.` });
  }

  const cleanName = String(name || 'Student').trim().slice(0, 30) || 'Student';
  const studentId = existingId || `std_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (!session.students[studentId]) {
    session.students[studentId] = {
      id: studentId,
      name: cleanName,
      joinedAt: Date.now(),
      lastActive: Date.now(),
      status: 'working',
      mistakesCount: 0,
      errorTypes: [],
      hintsUsed: 0,
      timeActiveSeconds: 0,
      latestErrorType: null,
      latestHint: null,
      solved: false,
      solvedAlone: false,
    };
  } else {
    session.students[studentId].name = cleanName;
    session.students[studentId].lastActive = Date.now();
  }

  res.json({
    success: true,
    studentId,
    code: session.code,
    problem: session.problem,
    problemImageUrl: session.problemImageUrl,
    referenceSolution: session.referenceSolution,
  });
});

// 5. Student Progress Event (mistake, hint, solved, status change)
app.post('/api/classes/:code/event', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const {
    studentId,
    status,
    mistakesCount,
    errorTypes,
    hintsUsed,
    timeActiveSeconds,
    latestErrorType,
    latestHint,
    solved,
    solvedAlone
  } = req.body || {};

  const session = classesStore.get(code);
  if (!session || !session.students[studentId]) {
    return res.status(404).json({ error: 'Session or student not found' });
  }

  const record = session.students[studentId];
  if (status) record.status = status;
  if (typeof mistakesCount === 'number') record.mistakesCount = mistakesCount;
  if (Array.isArray(errorTypes)) record.errorTypes = errorTypes;
  if (typeof hintsUsed === 'number') record.hintsUsed = hintsUsed;
  if (typeof timeActiveSeconds === 'number') record.timeActiveSeconds = timeActiveSeconds;
  if (latestErrorType !== undefined) record.latestErrorType = latestErrorType;
  if (latestHint !== undefined) record.latestHint = latestHint;
  if (typeof solved === 'boolean') record.solved = solved;
  if (typeof solvedAlone === 'boolean') record.solvedAlone = solvedAlone;
  record.lastActive = Date.now();

  res.json({ success: true });
});

// 6. Student Heartbeat (keepalive and timer sync)
app.post('/api/classes/:code/heartbeat', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const { studentId, timeActiveSeconds } = req.body || {};

  const session = classesStore.get(code);
  if (session && session.students[studentId]) {
    session.students[studentId].lastActive = Date.now();
    if (typeof timeActiveSeconds === 'number') {
      session.students[studentId].timeActiveSeconds = timeActiveSeconds;
    }
  }
  res.json({ success: true });
});

// 7. Real-Time Handwriting Check with Vision (Aware of Initial Task & Line-by-Line Completion)
app.post('/api/check-solution', async (req, res) => {
  try {
    const { imageBase64, problem, referenceSolution, isManualCheck } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `You are a strict, kind math teacher carefully grading handwritten student algebra work on lined notebook paper.
Your #1 priority is finding the FIRST mathematical error in the student's handwritten work.

TARGET INITIAL PROBLEM (Given to student):
${problem || 'Solve for x: 3(x - 2) + 4 = 2x + 7'}

TEACHER HIDDEN REFERENCE SOLUTION:
${referenceSolution || '3x - 6 + 4 = 2x + 7 => 3x - 2 = 2x + 7 => x = 9'}

CHECK MODE: ${isManualCheck ? 'Manual Check (Student requested immediate check of their current work)' : 'Background Auto-Check (Student is actively writing on the page)'}

CRITICAL INSTRUCTIONS FOR SPOTTING MISTAKES:
1. INITIAL TASK FAITHFULNESS CHECK (VERY FIRST LINE):
   - You MUST check the student's very first written line against the TARGET INITIAL PROBLEM!
   - Did the student copy the problem correctly? If they miscopied any number, variable, sign, or bracket (for example, writing 3(x + 2) instead of 3(x - 2), or changing a +4 to -4, or miscopying the right-hand side), this is an IMMEDIATE error on Line 1!
   - If they jumped directly into their first algebraic transformation without copying the initial problem, check whether that first line is a mathematically valid, correct transformation of the TARGET INITIAL PROBLEM. If their first step is an invalid operation on the original problem, mark Line 1 as an IMMEDIATE error!

2. STEP-BY-STEP EQUIVALENCE CHECK (Between each completed line and the line below it):
   - Expansion of brackets: e.g. 3(x - 2) MUST become 3x - 6. (Writing 3x + 6 is an immediate sign error).
   - Combining like terms: e.g. -6 + 4 MUST equal -2. (Writing +2 or -10 is an immediate arithmetic error).
   - Moving terms across "=": Subtraction/addition must be balanced on both sides. (e.g. 3x - 2x = x, 7 + 2 = 9).
   - Division / multiplication of entire equation: Must divide every term.

3. LINE-BY-LINE COMPLETION RULE (PREVENT FALSE ERRORS ON INCOMPLETE ACTIVE LINES):
   - Students write top-to-bottom on ruled paper. The bottom-most (last) line of handwriting is often in the middle of being written when an auto-check occurs.
   ${isManualCheck ? `
   - The student clicked 'Check now'. You may evaluate all completed statements including the bottom line. If the bottom line is unfinished or missing the right side, do not mark it an error unless it violates algebra.
   ` : `
   - This is an auto-check: ONLY check and grade COMPLETED PREVIOUS LINES (lines that have another line of handwriting below them)!
   - When the student moves to the next string/line below, the previous line is 100% complete and MUST be graded for correctness.
   - DO NOT flag an error on the bottom-most (last) line of handwriting unless:
     (a) There is ONLY ONE line on the canvas, and it is a blatant miscopy of the original problem (wrong numbers/signs), OR
     (b) The bottom-most line contains the final solution (e.g. "x = 9") and the problem is fully solved.
   - If all completed previous lines are algebraically correct, return {"status": "on_track"}!
   `}

4. CANVAS STATES:
   - If canvas is completely blank or only has doodles without math:
     {"status": "on_track", "error_box": null, "error_type": null, "confidence": 1.0, "hint": null}
   - If there is a genuine mistake in ANY completed line:
     * status: "error"
     * error_type: "sign" | "arithmetic" | "algebra" | "concept"
     * error_box: [ymin, xmin, ymax, xmax] coordinates from 0 to 1000 bounding the first incorrect line or expression.
     * confidence: 0.95
     * hint: One short, kind Socratic question pointing to the error without giving away the answer.
       (If Line 1 is a miscopy: e.g. "Check the numbers in your first line against the original problem.")
       (If Line 1 is a bad transformation: e.g. "Check how you expanded 3(x - 2).")
   - If and only if EVERY handwritten step is valid and follows from the initial problem:
     * If they wrote the correct final answer (e.g. x = 9):
       {"status": "solved", "error_box": null, "error_type": null, "confidence": 1.0, "hint": null}
     * If they are still solving correctly or working on an active line:
       {"status": "on_track", "error_box": null, "error_type": null, "confidence": 0.95, "hint": null}

Return valid JSON only matching the schema:
{
  "status": "on_track" | "error" | "solved",
  "error_box": [ymin, xmin, ymax, xmax] | null,
  "error_type": "sign" | "arithmetic" | "algebra" | "concept" | null,
  "confidence": number,
  "hint": string | null
}`;

    const textResponse = await callGeminiWithFailover({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data
            }
          },
          {
            text: promptText
          }
        ]
      }],
      config: {
        responseMimeType: "application/json",
      }
    });

    let text = textResponse?.trim() || '';
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (e) {
      console.error('Failed to parse AI response text:', text);
      res.json({
        status: "on_track",
        error_box: null,
        error_type: null,
        confidence: 0.9,
        hint: null
      });
    }
  } catch (error: any) {
    console.error('Error checking handwriting solution:', error);
    res.status(500).json({
      error: error.message || 'Vision check failed',
      isQuotaExceeded: error.status === 429
    });
  }
});

// 3. Teacher Dashboard "What to explain tomorrow" Generator
app.post('/api/teacher-summary', async (req, res) => {
  try {
    const { classStats } = req.body || {};

    const promptText = `You are a master math curriculum specialist.
Here are the current live stats for a class of 25 students working on algebra problems:
${JSON.stringify(classStats || {}, null, 2)}

Task: Write EXACTLY ONE concise, highly actionable sentence for the teacher's "What to explain tomorrow" box.
Highlight the specific common misconception or pitfall (e.g., "12 of 25 students lose the minus sign when expanding brackets — review distributive property with negative factors tomorrow.").
Do not include quotation marks or extra explanation.

Return JSON only:
{
  "summary": "..."
}`;

    const textResponse = await callGeminiWithFailover({
      contents: [{
        role: 'user',
        parts: [{ text: promptText }]
      }],
      config: {
        responseMimeType: "application/json",
      }
    });

    let text = textResponse?.trim() || '{"summary": "Review bracket expansion with negative signs with the whole class tomorrow."}';
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(text);
    res.json(result);
  } catch (error: any) {
    console.error('Error generating teacher summary:', error);
    res.json({
      summary: "Most common struggle is distributing negative factors across parentheses — start tomorrow's lesson with 3 quick warm-up examples."
    });
  }
});

// Vite Middleware for Development
if (process.env.NODE_ENV !== 'production') {
  const viteServer = await vite.createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(viteServer.middlewares);
  
  app.use('*', async (req, res) => {
    const url = req.originalUrl;
    try {
      const template = await viteServer.transformIndexHtml(
        url,
        (await import('fs')).readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8')
      );
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e: any) {
      viteServer.ssrFixStacktrace(e);
      res.status(500).end(e.message);
    }
  });
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

const port = process.env.PORT || 3000;
app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Red Pen server running at http://0.0.0.0:${port}`);
});

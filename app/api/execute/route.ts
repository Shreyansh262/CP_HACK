//  NO USE NOW 



// import { NextRequest, NextResponse } from 'next/server';

// // ── Piston API — completely free, no API key required ─────────────────────────
// // https://github.com/engineer-man/piston
// // Public instance: https://emkc.org/api/v2/piston
// // Rate limit: generous (~50-100 req/s), suitable for prototype use

// const PISTON_BASE = 'https://emkc.org/api/v2/piston';

// // Piston language IDs — use `GET /runtimes` to see all available versions
// const PISTON_LANGUAGES: Record<string, { language: string; version: string }> = {
//   cpp:    { language: 'c++',    version: '10.2.0' },   // GCC 10, C++17
//   python: { language: 'python', version: '3.10.0' },
// };

// // ── Types ──────────────────────────────────────────────────────────────────────

// interface SampleCase {
//   input: string;
//   output: string;
// }

// interface CaseResult {
//   index: number;
//   passed: boolean;
//   status: string;
//   stdout: string | null;
//   stderr: string | null;
//   expected: string;
//   time_ms: number | null;
// }

// interface PistonRunResult {
//   stdout: string;
//   stderr: string;
//   output: string;
//   code: number | null;
//   signal: string | null;
// }

// interface PistonResponse {
//   language: string;
//   version: string;
//   run: PistonRunResult;
//   compile?: PistonRunResult;
// }

// // ── Execution helper ───────────────────────────────────────────────────────────

// async function runWithPiston(
//   sourceCode: string,
//   language: string,
//   stdin: string,
// ): Promise<PistonResponse> {
//   const { language: lang, version } = PISTON_LANGUAGES[language];

//   const res = await fetch(`${PISTON_BASE}/execute`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       language: lang,
//       version,
//       files: [{ content: sourceCode }],
//       stdin,
//       run_timeout: 5000,          // 5s hard limit
//       compile_timeout: 10000,     // 10s compile limit (for C++)
//       run_memory_limit: 262144,   // 256 MB in KB
//     }),
//     signal: AbortSignal.timeout(20_000),
//   });

//   if (res.status === 429) throw new Error('RATE_LIMIT');
//   if (!res.ok) throw new Error(`Piston returned ${res.status}`);

//   return res.json() as Promise<PistonResponse>;
// }

// function interpretResult(
//   piston: PistonResponse,
//   expectedOutput: string,
//   index: number,
// ): CaseResult {
//   const run = piston.run;
//   const compile = piston.compile;

//   // Compilation error (C++ only)
//   if (compile && compile.code !== 0) {
//     return {
//       index,
//       passed: false,
//       status: 'Compilation Error',
//       stdout: null,
//       stderr: (compile.stderr || compile.output || '').slice(0, 500),
//       expected: expectedOutput,
//       time_ms: null,
//     };
//   }

//   const stdout = (run.stdout ?? '').trimEnd();
//   const expected = expectedOutput.trimEnd();

//   // Runtime error
//   if (run.code !== 0 || run.signal) {
//     const label = run.signal
//       ? `Runtime Error (${run.signal})`
//       : 'Runtime Error';
//     return {
//       index,
//       passed: false,
//       status: label,
//       stdout: stdout || null,
//       stderr: (run.stderr || '').slice(0, 300) || null,
//       expected,
//       time_ms: null,
//     };
//   }

//   const passed = stdout === expected;
//   return {
//     index,
//     passed,
//     status: passed ? 'Accepted' : 'Wrong Answer',
//     stdout,
//     stderr: null,
//     expected,
//     time_ms: null, // Piston doesn't return wall-clock time
//   };
// }

// // ── Route handler ──────────────────────────────────────────────────────────────

// export async function POST(req: NextRequest) {
//   const body = await req.json() as {
//     code?: string;
//     language?: string;
//     samples?: SampleCase[];
//   };

//   const { code, language, samples } = body;

//   if (!code?.trim()) {
//     return NextResponse.json({ error: 'code is required' }, { status: 400 });
//   }
//   if (!language || !PISTON_LANGUAGES[language]) {
//     return NextResponse.json({ error: 'language must be "cpp" or "python"' }, { status: 400 });
//   }
//   if (!Array.isArray(samples) || samples.length === 0) {
//     return NextResponse.json({ error: 'samples array is required' }, { status: 400 });
//   }

//   const results: CaseResult[] = [];

//   // Run sample cases sequentially (avoids hammering Piston)
//   for (let i = 0; i < Math.min(samples.length, 5); i++) {
//     const sample = samples[i];
//     try {
//       const piston = await runWithPiston(code, language, sample.input);
//       results.push(interpretResult(piston, sample.output, i + 1));
//     } catch (e) {
//       const msg = (e as Error).message;
//       if (msg === 'RATE_LIMIT') {
//         return NextResponse.json(
//           { error: 'Execution service is busy — try again in a moment.', results },
//           { status: 429 },
//         );
//       }
//       results.push({
//         index: i + 1,
//         passed: false,
//         status: msg.includes('timeout') ? 'Time Limit Exceeded' : 'Internal Error',
//         stdout: null,
//         stderr: msg,
//         expected: sample.output,
//         time_ms: null,
//       });
//     }
//   }

//   const allPassed = results.length > 0 && results.every((r) => r.passed);
//   return NextResponse.json({ results, allPassed });
// }
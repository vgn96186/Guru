/**
 * Local LLM Benchmark Utility
 * 
 * Measures and tracks inference latency for local AI operations.
 * Use to benchmark before/after optimization changes.
 */

import type { LocalLlmBackend } from '../../../modules/local-llm';
import { STREAM_TIMEOUT_MS } from './constants';

export interface BenchmarkResult {
  /** Total time in milliseconds from start to complete */
  totalMs: number;
  /** Time to first token (TTFT) in milliseconds */
  timeToFirstTokenMs: number;
  /** Number of tokens generated */
  tokenCount: number;
  /** Tokens per second */
  tokensPerSecond: number;
  /** Backend used (gpu/cpu/nano) */
  backend: LocalLlmBackend;
  /** Model path used */
  modelPath: string;
  /** Timestamp of benchmark */
  timestamp: number;
}

export interface BenchmarkConfig {
  /** Model path to test */
  modelPath: string;
  /** Test prompt */
  prompt?: string;
  /** System instruction */
  systemInstruction?: string;
  /** Number of warmup runs before benchmark */
  warmupRuns?: number;
  /** Number of benchmark runs to average */
  benchmarkRuns?: number;
}

interface BenchmarkMetrics {
  startTime: number;
  firstTokenTime: number | null;
  tokenCount: number;
  endTime: number;
}

const DEFAULT_PROMPT = 'Explain photosynthesis in one sentence.';
const DEFAULT_WARMUP_RUNS = 1;
const DEFAULT_BENCHMARK_RUNS = 3;

// In-memory storage for benchmark history (persists during session)
const benchmarkHistory: BenchmarkResult[] = [];
const MAX_HISTORY_ENTRIES = 50;

/**
 * Record a benchmark result and store in history
 */
function recordBenchmark(result: BenchmarkResult): void {
  benchmarkHistory.unshift(result); // Add to front
  if (benchmarkHistory.length > MAX_HISTORY_ENTRIES) {
    benchmarkHistory.pop(); // Remove oldest
  }
  
  // Log for debugging
  console.log(
    `[LLM Benchmark] ${result.backend} | ` +
    `Total: ${result.totalMs}ms | ` +
    `TTFT: ${result.timeToFirstTokenMs}ms | ` +
    `Tokens: ${result.tokenCount} | ` +
    `Speed: ${result.tokensPerSecond.toFixed(1)} tok/s`
  );
}

/**
 * Run a single benchmark iteration
 */
async function runBenchmarkIteration(
  modelPath: string,
  prompt: string,
  systemInstruction?: string,
): Promise<BenchmarkResult> {
  const LocalLlm = await import('../../../modules/local-llm');
  
  const metrics: BenchmarkMetrics = {
    startTime: Date.now(),
    firstTokenTime: null,
    tokenCount: 0,
    endTime: 0,
  };
  
  let completionReceived = false;
  
  // Subscribe to token events
  const tokenSub = LocalLlm.addLlmTokenListener(() => {
    if (metrics.firstTokenTime === null) {
      metrics.firstTokenTime = Date.now();
    }
    metrics.tokenCount++;
  });
  
  // Subscribe to completion event
  const completeSub = LocalLlm.addLlmCompleteListener(() => {
    completionReceived = true;
    metrics.endTime = Date.now();
  });
  
  // Subscribe to error event
  const errorSub = LocalLlm.addLlmErrorListener(() => {
    completionReceived = true;
    metrics.endTime = Date.now();
  });
  
  try {
    // Start streaming
    await LocalLlm.chatStream(
      [{ role: 'user', content: prompt }],
      {
        modelPath,
        systemInstruction: systemInstruction || 'You are a helpful assistant.',
        temperature: 0.7,
        topP: 0.9,
      }
    );
    
    // Wait for completion event (max 60s timeout)
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        completionReceived = true; // Force exit
        resolve();
      }, STREAM_TIMEOUT_MS);

      // Poll until completion or timeout using requestAnimationFrame-like approach
      const check = () => {
        if (completionReceived) {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    
    // Set endTime if not set by completion handler
    if (metrics.endTime === 0) {
      metrics.endTime = Date.now();
    }
    
    const totalMs = metrics.endTime - metrics.startTime;
    const timeToFirstTokenMs = metrics.firstTokenTime 
      ? metrics.firstTokenTime - metrics.startTime 
      : totalMs;
    const tokensPerSecond = metrics.tokenCount > 0 
      ? (metrics.tokenCount / totalMs) * 1000 
      : 0;
    
    // Get backend
    const backend = await LocalLlm.getBackend();
    
    return {
      totalMs,
      timeToFirstTokenMs,
      tokenCount: metrics.tokenCount,
      tokensPerSecond,
      backend,
      modelPath,
      timestamp: metrics.startTime,
    };
  } finally {
    tokenSub.remove();
    completeSub.remove();
    errorSub.remove();
    try {
      await LocalLlm.cancel();
    } catch {
      // Ignore cancel errors
    }
  }
}

/**
 * Run a complete benchmark with warmup and multiple iterations
 */
export async function runLocalLlmBenchmark(
  config: BenchmarkConfig,
): Promise<{
  results: BenchmarkResult[];
  average: {
    totalMs: number;
    timeToFirstTokenMs: number;
    tokensPerSecond: number;
  };
}> {
  const {
    modelPath,
    prompt = DEFAULT_PROMPT,
    systemInstruction,
    warmupRuns = DEFAULT_WARMUP_RUNS,
    benchmarkRuns = DEFAULT_BENCHMARK_RUNS,
  } = config;

  console.log(`[LLM Benchmark] Starting benchmark for ${modelPath}`);
  console.log(`[LLM Benchmark] Warmup runs: ${warmupRuns}, Benchmark runs: ${benchmarkRuns}`);

  // Run warmup iterations (don't record)
  for (let i = 0; i < warmupRuns; i++) {
    console.log(`[LLM Benchmark] Warmup run ${i + 1}/${warmupRuns}...`);
    await runBenchmarkIteration(modelPath, prompt, systemInstruction);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between runs
  }

  // Run benchmark iterations (record)
  const results: BenchmarkResult[] = [];
  for (let i = 0; i < benchmarkRuns; i++) {
    console.log(`[LLM Benchmark] Benchmark run ${i + 1}/${benchmarkRuns}...`);
    const result = await runBenchmarkIteration(modelPath, prompt, systemInstruction);
    recordBenchmark(result);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s between runs
  }

  // Calculate averages
  const average = {
    totalMs: results.reduce((sum, r) => sum + r.totalMs, 0) / results.length,
    timeToFirstTokenMs: results.reduce((sum, r) => sum + r.timeToFirstTokenMs, 0) / results.length,
    tokensPerSecond: results.reduce((sum, r) => sum + r.tokensPerSecond, 0) / results.length,
  };

  console.log(
    `[LLM Benchmark] Average: ${average.totalMs.toFixed(0)}ms total, ` +
    `${average.timeToFirstTokenMs.toFixed(0)}ms TTFT, ` +
    `${average.tokensPerSecond.toFixed(1)} tok/s`
  );

  return { results, average };
}

/**
 * Get benchmark history
 */
export function getBenchmarkHistory(): BenchmarkResult[] {
  return [...benchmarkHistory];
}

/**
 * Clear benchmark history
 */
export function clearBenchmarkHistory(): void {
  benchmarkHistory.length = 0;
}

/**
 * Compare two benchmark results
 */
export function compareBenchmarks(
  before: BenchmarkResult,
  after: BenchmarkResult,
): {
  totalMsDelta: number;
  totalMsPercentChange: number;
  ttftDelta: number;
  ttftPercentChange: number;
  speedDelta: number;
  speedPercentChange: number;
} {
  const totalMsDelta = after.totalMs - before.totalMs;
  const totalMsPercentChange = (totalMsDelta / before.totalMs) * 100;
  
  const ttftDelta = after.timeToFirstTokenMs - before.timeToFirstTokenMs;
  const ttftPercentChange = (ttftDelta / before.timeToFirstTokenMs) * 100;
  
  const speedDelta = after.tokensPerSecond - before.tokensPerSecond;
  const speedPercentChange = (speedDelta / before.tokensPerSecond) * 100;

  return {
    totalMsDelta,
    totalMsPercentChange,
    ttftDelta,
    ttftPercentChange,
    speedDelta,
    speedPercentChange,
  };
}
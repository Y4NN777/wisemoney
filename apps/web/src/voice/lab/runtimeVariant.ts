/** Safari before 26 without WebGPU cannot run the asyncify build; same rule as transformers.js. */
export function runtimeVariant(userAgent: string, hasWebGpu: boolean): "asyncify" | "plain" {
  const isSafari = /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|FxiOS|Android)/.test(userAgent);
  const version = Number(/Version\/(\d+)/.exec(userAgent)?.[1] ?? Number.NaN);
  return isSafari && version < 26 && !hasWebGpu ? "plain" : "asyncify";
}

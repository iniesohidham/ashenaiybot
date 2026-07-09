// Module-level holder for the current session's raw initData string, set
// once by providers.tsx right after SDK init and read by every api.ts call
// (US-6.1 AC: "initData is sent with every API request"). A plain module
// variable is enough — this whole app is a client-only SPA-like shell
// bootstrapped once per page load, no SSR/multi-request concerns here.
let rawInitData: string | null = null;

export function setInitDataRaw(value: string | null): void {
  rawInitData = value;
}

export function getInitDataRaw(): string | null {
  return rawInitData;
}

// Tiny id helpers (UUID-ish, enough for client-side state)
export const uid = (prefix = ''): string => {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return prefix ? `${prefix}_${ts}_${rand}` : `${ts}_${rand}`;
};

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

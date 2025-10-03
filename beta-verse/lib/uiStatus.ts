type UiStatus = 'open' | 'locked' | 'running' | 'settled' | 'preopen' | 'cancelled';

type DayInfo = {
  // from DB/view for that **specific day**
  day_date: string;             // '2025-09-12'
  start_at: string | null;
  end_at: string | null;
  join_open_at: string | null;
  join_close_at: string | null;
  status?: 'open'|'running'|'settled'|'cancelled'|null; // DB status (optional)
  ui_status?: UiStatus;         // if you already have this from a view
};

type PickInfo = {
  hasPick: boolean;             // did the user submit a pick for this day?
  teamName?: string | null;     // display label of pick (if any)
  // result is filled after resolution
  result?: 'win' | 'loss' | 'push' | 'pending' | null;
};

export function computeUiStatusForDay(d: DayInfo): UiStatus {
  if (d.ui_status) return d.ui_status;
  const now = Date.now();
  const start = d.start_at ? new Date(d.start_at).getTime() : NaN;
  const end   = d.end_at   ? new Date(d.end_at).getTime()   : (isFinite(start) ? start + 8*3600e3 : NaN);
  const open  = d.join_open_at  ? new Date(d.join_open_at).getTime()  : NaN;
  const close = d.join_close_at ? new Date(d.join_close_at).getTime() : (isFinite(start) ? start - 30*60e3 : NaN);

  // honour DB hard states first
  if (d.status === 'cancelled') return 'cancelled';
  if (isFinite(end) && now >= end) return 'settled';
  if (isFinite(start) && now >= start && (!isFinite(end) || now < end)) return 'running';
  if (isFinite(close) && isFinite(start) && now >= close && now < start) return 'locked';
  if (isFinite(open) && isFinite(close) && now >= open && now < close) return 'open';
  if (isFinite(open) && now < open) return 'preopen';
  return 'open'; // safest fallback
}

export function labelForDay(d: DayInfo, p: PickInfo) {
  const ui = computeUiStatusForDay(d);

  // If day is finished/resolved, show outcome if we have it
  if (ui === 'settled' || ui === 'cancelled') {
    if (p.hasPick && p.result) {
      if (p.result === 'win')  return { text: 'Won',        tone: 'green',  sub: p.teamName ?? null };
      if (p.result === 'loss') return { text: 'Lost',       tone: 'red',    sub: p.teamName ?? null };
      if (p.result === 'push') return { text: 'Push',       tone: 'orange', sub: p.teamName ?? null };
      // settled but no result yet → show pending result
      return { text: 'Finished — Pending Result', tone: 'muted', sub: p.teamName ?? null };
    }
    // no pick that day
    return { text: ui === 'cancelled' ? 'Cancelled' : 'Finished — No Pick', tone: 'muted', sub: null };
  }

  // Game is running
  if (ui === 'running') {
    if (p.hasPick) return { text: 'In Progress', tone: 'muted', sub: p.teamName ?? null };
    return { text: 'In Progress — No Pick', tone: 'muted', sub: null };
  }

  // Locked window (can’t change/new picks)
  if (ui === 'locked') {
    if (p.hasPick) return { text: 'Locked', tone: 'muted', sub: p.teamName ?? null };
    return { text: 'Locked — Missed Window', tone: 'muted', sub: null };
  }

  // Open window (CTA only if no pick yet)
  if (ui === 'open') {
    if (p.hasPick) return { text: 'Picked', tone: 'gold', sub: p.teamName ?? null }; // allow "Change" CTA separately if you support edits
    return { text: 'Make Your Selection', tone: 'gold', sub: null };
  }

  // Preopen (before join opens)
  if (ui === 'preopen') {
    if (p.hasPick) return { text: 'Opens Soon', tone: 'muted', sub: p.teamName ?? null };
    return { text: 'Opens Soon', tone: 'muted', sub: null };
  }

  return { text: '—', tone: 'muted', sub: null };
}

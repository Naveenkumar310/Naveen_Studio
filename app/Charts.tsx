import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

// Hand-written SVG charts. One series per chart (no dual axes), thin marks, hairline grid,
// accent = current period, grey = context. Colours come from CSS variables (--series-1 etc.).

export type Point = { day: string; label: string; value: number };

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (d: Date, long = false) => d.toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' });

/** Counts dated events into the last `days` local days, ending today. */
export function buckets(events: { at: string }[], days: number, end = new Date()): Point[] {
    const out: Point[] = [];
    const index = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
        index.set(dayKey(d), out.length);
        out.push({ day: dayKey(d), label: dayLabel(d, true), value: 0 });
    }
    for (const e of events) {
        const i = index.get(dayKey(new Date(e.at)));
        if (i !== undefined) out[i].value++;
    }
    return out;
}

/** "1 commit", "3 commits", "1 task added". */
export const units = (n: number, unit: string) => n === 1 ? unit.replace(/s\b/, '') : unit;
export const compact = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : n.toLocaleString();
function niceMax(max: number) {
    if (max <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= max) || max;
}
/** Bar with a 4px rounded data end and a square base. */
function bar(x: number, y: number, w: number, h: number, r = 4) {
    if (h <= 0) return '';
    r = Math.min(r, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function useWidth<T extends HTMLElement>(fallback: number) {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(fallback);
    useEffect(() => {
        if (!ref.current) return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, Math.floor(entry.contentRect.width))));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

/** Seven-day column trend for a stat tile. Today is the accent; earlier days are context grey. */
export function MiniBars({ data, unit }: { data: Point[]; unit: string }) {
    const [hover, setHover] = useState<number | null>(null);
    const W = 96, H = 44, slot = W / data.length, bw = Math.min(12, slot - 2), max = Math.max(1, ...data.map(d => d.value));
    return <div className="mini-bars" onPointerLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${unit} per day, last ${data.length} days: ${data.map(d => `${d.label} ${d.value}`).join(', ')}`}>
            {data.map((d, i) => {
                const h = d.value ? Math.max(3, (d.value / max) * (H - 2)) : 0, x = i * slot + (slot - bw) / 2;
                return <g key={d.day}>
                    <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" onPointerEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${d.label}: ${d.value} ${units(d.value, unit)}`} />
                    {h ? <path d={bar(x, H - h, bw, h)} className={i === data.length - 1 ? 'mark-accent' : hover === i ? 'mark-hover' : 'mark-context'} pointerEvents="none" />
                        : <rect x={x} y={H - 2} width={bw} height={2} rx={1} className="mark-empty" pointerEvents="none" />}
                </g>;
            })}
        </svg>
        {hover !== null && <div className="chart-tip mini" style={{ left: Math.min(hover * slot, W - 60) }}><b>{data[hover].value.toLocaleString()} {units(data[hover].value, unit)}</b><span>{data[hover].label}</span></div>}
    </div>;
}

export type Delta = { current: number; previous: number; upIsGood?: boolean };
function DeltaText({ current, previous, upIsGood = true }: Delta) {
    const diff = current - previous;
    if (!current && !previous) return <span className="delta neutral"><Minus size={13} /> No activity <small>last 2 weeks</small></span>;
    if (!previous) return <span className={'delta ' + (upIsGood ? 'up' : 'neutral')}><ArrowUpRight size={13} /> New <small>vs last week</small></span>;
    const pct = Math.round((diff / previous) * 100);
    const cls = diff === 0 ? 'neutral' : diff > 0 && upIsGood ? 'up' : 'neutral';
    return <span className={'delta ' + cls}>{diff > 0 ? <ArrowUpRight size={13} /> : diff < 0 ? <ArrowDownRight size={13} /> : <Minus size={13} />} {diff > 0 ? '+' : ''}{pct}% <small>vs last week</small></span>;
}

/** Stat tile: label, value, delta vs a named period, seven-day trend. */
export function StatTile({ label, icon, value, delta, note, trend, unit }: { label: string; icon: ReactNode; value: number; delta?: Delta; note?: string; trend: Point[]; unit: string }) {
    return <section className="stat-card">
        <header><span>{label}</span>{icon}</header>
        <div className="stat-inner">
            <div className="stat-figure"><b>{compact(value)}</b>{delta ? <DeltaText {...delta} /> : <span className="delta neutral">{note}</span>}</div>
            <MiniBars data={trend} unit={unit} />
        </div>
    </section>;
}

/** Single-series area chart with crosshair tooltip, keyboard stepping and a table view. */
export function AreaChart({ data, unit, title }: { data: Point[]; unit: string; title: string }) {
    const [ref, width] = useWidth<HTMLDivElement>(640);
    const [hover, setHover] = useState<number | null>(null);
    const H = 220, AX = 28, L = 36, R = 44, T = 14;
    const plotW = width - L - R, n = data.length;
    const top = niceMax(Math.max(0, ...data.map(d => d.value)));
    const x = (i: number) => L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v: number) => T + (H - T) - (v / top) * (H - T);
    const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
    const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`;
    const ticks = [0, top / 2, top];
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))));
    const last = data[n - 1];
    const total = data.reduce((s, d) => s + d.value, 0);
    const pick = (clientX: number, el: SVGSVGElement) => {
        const px = clientX - el.getBoundingClientRect().left;
        setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / plotW) * (n - 1)))));
    };
    const key = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') setHover(h => Math.min(n - 1, (h ?? n - 1) + 1));
        if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? n - 1) - 1));
    };
    const h = hover !== null ? data[hover] : null;
    return <div className="area-chart" ref={ref}>
        <div className="chart-plot" tabIndex={0} onKeyDown={key} onBlur={() => setHover(null)} aria-label={`${title}. Use arrow keys to read each day.`}>
            <svg width={width} height={H + AX} role="img" aria-label={`${title}: ${total} ${unit} in ${n} days`}
                onPointerMove={e => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)}>
                {ticks.map(t => <g key={t}><line x1={L} x2={L + plotW} y1={y(t)} y2={y(t)} className={t ? 'grid' : 'axis'} /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="tick">{compact(t)}</text></g>)}
                {data.map((d, i) => i % every === 0 || i === n - 1 ? <text key={d.day} x={x(i)} y={H + 20} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="tick">{d.label.replace(/^\w+,?\s/, '')}</text> : null)}
                <path d={area} className="area-fill" />
                <path d={line} className="area-line" />
                {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H} className="crosshair" />}
                <circle cx={x(hover ?? n - 1)} cy={y((h ?? last).value)} r={4} className="end-dot" />
                {hover === null && <text x={x(n - 1) + 9} y={y(last.value) + 4} className="end-label">{compact(last.value)}</text>}
            </svg>
            {h && <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover!) - 70, 0), width - 150) }}>
                <b>{h.value.toLocaleString()} {units(h.value, unit)}</b><span><i className="key-line" />{h.label}</span>
            </div>}
            {!total && <div className="chart-empty">No {unit} in this range yet</div>}
        </div>
        <details className="table-view"><summary>Show as table</summary>
            <table><thead><tr><th>Day</th><th>{unit[0].toUpperCase() + unit.slice(1)}</th></tr></thead>
                <tbody>{[...data].reverse().map(d => <tr key={d.day}><td>{d.label}</td><td>{d.value.toLocaleString()}</td></tr>)}</tbody></table>
        </details>
    </div>;
}

/** Small trend line: context grey with today's point in the accent. */
export function Sparkline({ data, label }: { data: Point[]; label: string }) {
    const W = 160, H = 36, max = Math.max(1, ...data.map(d => d.value));
    const x = (i: number) => 2 + (i / Math.max(1, data.length - 1)) * (W - 8);
    const y = (v: number) => H - 4 - (v / max) * (H - 10);
    const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
    const last = data[data.length - 1];
    return <svg width={W} height={H} role="img" aria-label={`${label}: ${data.reduce((s, d) => s + d.value, 0)} in ${data.length} days`} className="sparkline">
        <path d={path} className="spark-line" />
        <circle cx={x(data.length - 1)} cy={y(last?.value || 0)} r={4} className="end-dot" />
    </svg>;
}

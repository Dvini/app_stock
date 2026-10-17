import { useRef, useEffect, useState, useMemo } from 'react';
import { formatNumber } from '../utils/formatters';

interface ChartPoint {
    time?: number;
    timestamp?: number;
    date?: string;
    price?: number;
    close?: number;
}

interface WebGPUChartProps {
    data?: ChartPoint[];
    color?: number[];
    currency?: string;
    range?: string;
}

interface TooltipState {
    x: number;
    y: number;
    price: string;
    date: string;
    index: number;
}

const PADDING = { top: 20, right: 20, bottom: 30, left: 64 };
const POSITIVE = '#10b981';
const NEGATIVE = '#f43f5e';
const GRID = 'rgba(255, 255, 255, 0.07)';
const AXIS_TEXT = '#9aa0c2';
const ZERO_LINE = 'rgba(255, 255, 255, 0.25)';

/** Value bounds with headroom so the line never touches the top or bottom edge */
const getBounds = (points: number[]) => {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min;
    const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(max) * 0.01, 1);
    return { min: min - pad, max: max + pad };
};

/** Round axis values (1, 2, 2.5 or 5 × 10^n apart) inside the bounds; zero gets a line when in range */
const niceTicks = (min: number, max: number, target = 5) => {
    const raw = (max - min) / target;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / magnitude;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
    const ticks: number[] = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
        ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return ticks;
};

const isIntraday = (range: string) => range === '1d' || range === '5d';

const formatAxisLabel = (date: Date, range: string) => {
    if (range === '1d') return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    if (range === '5d') return date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric' });
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatTooltipDate = (date: Date, range: string) =>
    date.toLocaleString(
        'pl-PL',
        isIntraday(range)
            ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
            : { day: 'numeric', month: 'short', year: 'numeric' }
    );

export const WebGPUChart: React.FC<WebGPUChartProps> = ({
    data = [],
    color = [0.16, 0.8, 0.45, 1.0],
    currency = 'PLN',
    range = '1mo'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    // Data parsing (memoized so hover re-renders do not redraw the canvas)
    const { points, times } = useMemo(() => {
        const hasObjects = data.length > 0 && typeof data[0] === 'object' && data[0] !== null;
        if (!hasObjects) return { points: data as unknown as number[], times: [] as number[] };
        return {
            points: data.map(d => d?.price ?? d?.close ?? 0),
            times: data.map(d => d?.timestamp || d?.time || 0)
        };
    }, [data]);

    // Colors
    const isNegative = (color?.[0] ?? 0) > 0.5 && (color?.[1] ?? 0) < 0.5;
    const themeColor = isNegative ? NEGATIVE : POSITIVE;

    // Color of the line at a point, matching how the line is drawn below
    const pointColor = (i: number) => {
        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        if (minVal < 0 && maxVal > 0) return (points[i] ?? 0) >= 0 ? POSITIVE : NEGATIVE;
        if (maxVal <= 0 && minVal < 0) return NEGATIVE;
        return themeColor;
    };

    const getX = (i: number, chartW: number) =>
        points.length > 1 ? PADDING.left + (i / (points.length - 1)) * chartW : PADDING.left + chartW / 2;

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || points.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const w = rect.width;
            const h = rect.height;
            const chartW = w - PADDING.left - PADDING.right;
            const chartH = h - PADDING.top - PADDING.bottom;
            const bottom = PADDING.top + chartH;

            ctx.clearRect(0, 0, w, h);

            const { min, max } = getBounds(points);
            const span = max - min;
            const getY = (val: number) => PADDING.top + chartH - ((val - min) / span) * chartH;
            const xAt = (i: number) => getX(i, chartW);

            // Horizontal grid + value labels
            ctx.lineWidth = 1;
            ctx.font = '10px Inter, system-ui, sans-serif';
            niceTicks(min, max).forEach(tick => {
                const y = getY(tick);
                ctx.strokeStyle = GRID;
                ctx.beginPath();
                ctx.moveTo(PADDING.left, y);
                ctx.lineTo(w - PADDING.right, y);
                ctx.stroke();

                ctx.fillStyle = AXIS_TEXT;
                ctx.textAlign = 'right';
                ctx.fillText(formatNumber(tick), PADDING.left - 10, y + 3);
            });

            // Time labels: edges are aligned inwards so they are not clipped
            if (times.length > 0) {
                const xSteps = Math.min(4, times.length - 1);
                const indices =
                    xSteps === 0
                        ? [0]
                        : [
                              ...new Set(
                                  Array.from({ length: xSteps + 1 }, (_, i) =>
                                      Math.round((i * (times.length - 1)) / xSteps)
                                  )
                              )
                          ];
                ctx.fillStyle = AXIS_TEXT;
                indices.forEach((idx, n) => {
                    ctx.textAlign =
                        indices.length === 1
                            ? 'center'
                            : n === 0
                              ? 'left'
                              : n === indices.length - 1
                                ? 'right'
                                : 'center';
                    const x = xAt(idx);
                    const label = formatAxisLabel(new Date((times[idx] || 0) * 1000), range);
                    const anchor = ctx.textAlign === 'left' ? x - 4 : ctx.textAlign === 'right' ? x + 4 : x;
                    ctx.fillText(label, anchor, h - 10);
                });
            }

            const minVal = Math.min(...points);
            const maxVal = Math.max(...points);
            const crossesZero = minVal < 0 && maxVal > 0;

            // Series that stay on one side of zero use one color: the trend color from the caller for
            // positive series (prices, portfolio value), red for an all-negative result
            const lineColor = (gradient: CanvasGradient) => {
                if (!crossesZero) {
                    const c = maxVal <= 0 && minVal < 0 ? NEGATIVE : themeColor;
                    gradient.addColorStop(0, c);
                    gradient.addColorStop(1, c);
                    return gradient;
                }
                // P/L crossing zero: color each stretch by its sign, switching where the line crosses zero
                const getColor = (val: number) => (val >= 0 ? POSITIVE : NEGATIVE);
                gradient.addColorStop(0, getColor(points[0]!));
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i]!;
                    const p2 = points[i + 1]!;
                    const pos1 = i / (points.length - 1);
                    const pos2 = (i + 1) / (points.length - 1);
                    if ((p1 >= 0 && p2 < 0) || (p1 < 0 && p2 >= 0)) {
                        const ratio = Math.abs(p1) / (Math.abs(p1) + Math.abs(p2));
                        const crossPos = pos1 + (pos2 - pos1) * ratio;
                        gradient.addColorStop(Math.max(0, crossPos - 0.002), getColor(p1));
                        gradient.addColorStop(Math.min(1, crossPos + 0.002), getColor(p2));
                    }
                    gradient.addColorStop(pos2, getColor(p2));
                }
                return gradient;
            };

            const strokeGradient = lineColor(ctx.createLinearGradient(PADDING.left, 0, w - PADDING.right, 0));
            const fillGradient = lineColor(ctx.createLinearGradient(PADDING.left, 0, w - PADDING.right, 0));

            if (crossesZero) {
                ctx.save();
                ctx.strokeStyle = ZERO_LINE;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(PADDING.left, getY(0));
                ctx.lineTo(w - PADDING.right, getY(0));
                ctx.stroke();
                ctx.restore();
            }

            if (points.length === 1) {
                ctx.fillStyle = strokeGradient;
                ctx.beginPath();
                ctx.arc(xAt(0), getY(points[0]!), 4, 0, Math.PI * 2);
                ctx.fill();
                return;
            }

            // Area between the line and its baseline: zero for a result that has losses (so green fills
            // profit and red fills loss), otherwise the bottom edge. Single-color areas fade towards the baseline.
            const allNegative = maxVal <= 0 && minVal < 0;
            const baseline = crossesZero ? getY(0) : allNegative ? PADDING.top : bottom;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xAt(0), baseline);
            points.forEach((val, i) => ctx.lineTo(xAt(i), getY(val)));
            ctx.lineTo(xAt(points.length - 1), baseline);
            ctx.closePath();
            if (crossesZero) {
                ctx.globalAlpha = 0.18;
                ctx.fillStyle = fillGradient;
            } else {
                const c = allNegative ? NEGATIVE : themeColor;
                const fade = ctx.createLinearGradient(0, allNegative ? bottom : PADDING.top, 0, baseline);
                fade.addColorStop(0, `${c}55`);
                fade.addColorStop(1, `${c}00`);
                ctx.fillStyle = fade;
            }
            ctx.fill();
            ctx.restore();

            ctx.beginPath();
            points.forEach((val, i) => {
                if (i === 0) ctx.moveTo(xAt(i), getY(val));
                else ctx.lineTo(xAt(i), getY(val));
            });
            ctx.strokeStyle = strokeGradient;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.stroke();
        };

        render();
        const observer = new ResizeObserver(render);
        observer.observe(container);

        return () => observer.disconnect();
    }, [points, times, range, themeColor]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current || points.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const xLocal = e.clientX - rect.left;

        const chartW = rect.width - PADDING.left - PADDING.right;
        const chartH = rect.height - PADDING.top - PADDING.bottom;

        if (xLocal < PADDING.left || xLocal > rect.width - PADDING.right) {
            setTooltip(null);
            return;
        }

        const ratio = (xLocal - PADDING.left) / chartW;
        const index = Math.min(Math.max(Math.round(ratio * (points.length - 1)), 0), points.length - 1);

        const price = points[index]!;
        const time = times[index];
        const { min, max } = getBounds(points);

        setTooltip({
            x: getX(index, chartW),
            y: PADDING.top + chartH - ((price - min) / (max - min)) * chartH,
            price: formatNumber(price),
            date: time ? formatTooltipDate(new Date(time * 1000), range) : '',
            index
        });
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative cursor-crosshair group"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
        >
            {/* Absolute so the canvas size never feeds back into the container size */}
            <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

            {tooltip && (
                <>
                    <div
                        className="absolute top-5 bottom-[30px] border-l border-slate-500/50 border-dashed pointer-events-none"
                        style={{ left: tooltip.x }}
                    />
                    <div
                        className="absolute left-[64px] right-5 border-t border-slate-500/50 border-dashed pointer-events-none"
                        style={{ top: tooltip.y }}
                    />

                    <div
                        className="absolute w-3 h-3 bg-white rounded-full border-2 shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: tooltip.x, top: tooltip.y, borderColor: pointColor(tooltip.index) }}
                    />

                    <div
                        className="absolute bg-slate-800 text-white rounded-lg p-2 shadow-xl border border-slate-700 pointer-events-none z-20 whitespace-nowrap"
                        style={{
                            left: tooltip.x,
                            top: tooltip.y - 10,
                            transform: `translate(${
                                tooltip.x < 120
                                    ? '0%'
                                    : tooltip.x > (containerRef.current?.clientWidth ?? 0) - 120
                                      ? '-100%'
                                      : '-50%'
                            }, ${tooltip.y < 70 ? '30px' : '-100%'})`
                        }}
                    >
                        <div className="font-bold text-sm">
                            {tooltip.price} <span className="text-xs text-slate-400 font-normal">{currency}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{tooltip.date}</div>
                    </div>
                </>
            )}
        </div>
    );
};

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
    /** Reference value the change is measured from; drawn as a dashed line */
    baseline?: number;
    /**
     * Value that splits the line into green (at or above) and red (below), e.g. the purchase price.
     * Without it the split is at zero, for P/L series; series that stay positive use `color`.
     */
    splitAt?: number;
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

/** Values the axis must cover: the series plus any reference lines drawn over it */
const boundsPoints = (points: number[], ...refs: Array<number | undefined>) => [
    ...points,
    ...refs.filter((v): v is number => v !== undefined)
];

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
    range = '1mo',
    baseline,
    splitAt
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

    // How the series sits against the split value: crossing it, entirely below, or entirely at/above
    const pivot = splitAt ?? 0;
    const split = useMemo(() => {
        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        return { crosses: minVal < pivot && maxVal > pivot, allBelow: maxVal <= pivot && minVal < pivot };
    }, [points, pivot]);
    // One color for a series that does not cross: red below the split; above it green against a
    // purchase price, otherwise the caller's trend color
    const singleColor = split.allBelow ? NEGATIVE : splitAt !== undefined ? POSITIVE : themeColor;

    // Color of the line at a point, matching how the line is drawn below
    const pointColor = (i: number) => (split.crosses ? ((points[i] ?? 0) >= pivot ? POSITIVE : NEGATIVE) : singleColor);

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

            const { min, max } = getBounds(boundsPoints(points, baseline, splitAt));
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

            const { crosses, allBelow } = split;

            const lineColor = (gradient: CanvasGradient) => {
                if (!crosses) {
                    gradient.addColorStop(0, singleColor);
                    gradient.addColorStop(1, singleColor);
                    return gradient;
                }
                // Crossing the split value: color each stretch by its side, switching where the line crosses
                const getColor = (val: number) => (val >= pivot ? POSITIVE : NEGATIVE);
                gradient.addColorStop(0, getColor(points[0]!));
                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i]!;
                    const p2 = points[i + 1]!;
                    const pos1 = i / (points.length - 1);
                    const pos2 = (i + 1) / (points.length - 1);
                    if ((p1 >= pivot && p2 < pivot) || (p1 < pivot && p2 >= pivot)) {
                        const ratio = Math.abs(p1 - pivot) / (Math.abs(p1 - pivot) + Math.abs(p2 - pivot));
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

            // Zero line for a P/L series; a custom split value is shown by the caller through `baseline`
            if (crosses && splitAt === undefined) {
                ctx.save();
                ctx.strokeStyle = ZERO_LINE;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(PADDING.left, getY(0));
                ctx.lineTo(w - PADDING.right, getY(0));
                ctx.stroke();
                ctx.restore();
            }

            // Reference line the change is measured from (labeled by the caller): the line ends above it
            // in green, below it in red
            if (baseline !== undefined) {
                const y = getY(baseline);
                ctx.save();
                ctx.strokeStyle = ZERO_LINE;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(PADDING.left, y);
                ctx.lineTo(w - PADDING.right, y);
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

            // Area between the line and the split value (purchase price, or zero for a P/L series with losses),
            // so green fills gain and red fills loss; otherwise down to the bottom edge. Single-color areas
            // fade towards that edge.
            const areaBase = splitAt !== undefined || crosses ? getY(pivot) : allBelow ? PADDING.top : bottom;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(xAt(0), areaBase);
            points.forEach((val, i) => ctx.lineTo(xAt(i), getY(val)));
            ctx.lineTo(xAt(points.length - 1), areaBase);
            ctx.closePath();
            if (crosses) {
                ctx.globalAlpha = 0.18;
                ctx.fillStyle = fillGradient;
            } else {
                const fade = ctx.createLinearGradient(0, allBelow ? bottom : PADDING.top, 0, areaBase);
                fade.addColorStop(0, `${singleColor}55`);
                fade.addColorStop(1, `${singleColor}00`);
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
    }, [points, times, range, baseline, splitAt, split, singleColor, pivot]);

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
        const { min, max } = getBounds(boundsPoints(points, baseline, splitAt));

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

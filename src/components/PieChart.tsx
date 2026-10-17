import { useRef, useEffect, useState, useMemo } from 'react';
import { plTextClass } from '../lib/utils';

interface PieChartData {
    label: string;
    value: number;
    pl?: string;
}

interface PieChartProps {
    data: PieChartData[];
    colors?: string[];
}

interface Tooltip {
    x: number;
    y: number;
    flip: boolean;
    label: string;
    value: number;
    percent: string;
    pl?: string;
    color: string;
}

/**
 * Default slice colors, in fixed order; legends drawn outside the chart use the same list.
 * Validated for the dark surface (adjacent pairs: CVD ΔE >= 8.4, normal-vision ΔE >= 19.3).
 * Callers fold anything past the eighth item into "Inne" instead of cycling the colors.
 */
export const PIE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Neutral color for the folded "Inne" slice */
export const PIE_OTHER_COLOR = '#8b93a8';

export const pieColor = (index: number, colors: string[] = PIE_COLORS) =>
    colors[index % colors.length] || PIE_COLORS[0]!;

export const PieChart: React.FC<PieChartProps> = ({ data, colors = [] }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<Tooltip | null>(null);

    const colorsKey = colors.join(',');
    const chartColors = useMemo(() => (colorsKey ? colorsKey.split(',') : PIE_COLORS), [colorsKey]);

    // Only positive values take up space; colors stay tied to the item's position in `data`
    const slices = useMemo(() => {
        const visible = data.map((item, i) => ({ ...item, color: pieColor(i, chartColors) })).filter(d => d.value > 0);
        const total = visible.reduce((acc, item) => acc + item.value, 0);
        let start = -Math.PI / 2; // 12 o'clock
        return visible.map(item => {
            const angle = (item.value / total) * 2 * Math.PI;
            const slice = { ...item, start, end: start + angle, share: item.value / total };
            start += angle;
            return slice;
        });
    }, [data, chartColors]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || slices.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const w = rect.width;
            const h = rect.height;
            const centerX = w / 2;
            const centerY = h / 2;
            const radius = Math.min(centerX, centerY) * 0.8;
            const innerRadius = radius * 0.6; // Donut style

            ctx.clearRect(0, 0, w, h);

            slices.forEach(slice => {
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, slice.start, slice.end);
                ctx.arc(centerX, centerY, innerRadius, slice.end, slice.start, true);
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();

                // Separators between slices; a lone slice is a full ring and needs none
                if (slices.length > 1) {
                    ctx.strokeStyle = '#0b0c22';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        };

        render();
        const observer = new ResizeObserver(render);
        observer.observe(container);

        return () => observer.disconnect();
    }, [slices]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current || slices.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = Math.min(centerX, centerY) * 0.8;
        const innerRadius = radius * 0.6;

        if (dist < innerRadius || dist > radius) {
            setTooltip(null);
            return;
        }

        // atan2 gives -PI..PI with 0 at 3 o'clock; slices start at 12 o'clock (-PI/2)
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += 2 * Math.PI;

        const slice = slices.find(s => angle >= s.start && angle < s.end);
        if (!slice) {
            setTooltip(null);
            return;
        }

        setTooltip({
            x,
            y,
            flip: x > rect.width - 170,
            label: slice.label,
            value: slice.value,
            percent: (slice.share * 100).toFixed(1) + '%',
            pl: slice.pl,
            color: slice.color
        });
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
        >
            <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
            {tooltip && (
                <div
                    className="absolute bg-slate-800 text-white rounded-lg p-3 shadow-xl border border-slate-700 pointer-events-none z-20 min-w-[120px]"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: tooltip.flip ? 'translate(calc(-100% - 10px), 10px)' : 'translate(10px, 10px)'
                    }}
                >
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-3 h-3 rounded-full" style={{ background: tooltip.color }} />
                        <span className="font-bold">{tooltip.label}</span>
                    </div>
                    <div className="text-xl font-bold mb-1">{tooltip.percent}</div>
                    <div className="text-xs text-slate-400">
                        {new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(tooltip.value)}
                    </div>
                    {tooltip.pl && (
                        <div className={`text-xs mt-1 font-bold ${plTextClass(tooltip.pl)}`}>{tooltip.pl}</div>
                    )}
                </div>
            )}
        </div>
    );
};

import { useRef, useEffect, useState } from 'react';
import { formatNumber } from '../utils/formatters';

interface WebGPUChartProps {
    data?: any[];
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

export const WebGPUChart: React.FC<WebGPUChartProps> = ({
    data = [],
    color = [0.16, 0.8, 0.45, 1.0],
    currency = 'PLN',
    range = '1mo'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    // Data parsing
    const hasObjects = data.length > 0 && typeof data?.[0] === 'object' && data?.[0] !== null;
    const points: number[] = hasObjects ? data.map(d => d?.price || 0) : (data as number[]);
    const times: number[] = hasObjects ? data.map(d => d?.timestamp || d?.time || 0) : [];

    // Colors
    const isNegative = (color?.[0] ?? 0) > 0.5 && (color?.[1] ?? 0) < 0.5;
    const themeColor = isNegative ? '#f43f5e' : '#10b981';

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || points.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = rect.height;

            const padding = { top: 20, right: 20, bottom: 30, left: 60 };
            const chartW = w - padding.left - padding.right;
            const chartH = h - padding.top - padding.bottom;

            ctx.clearRect(0, 0, w, h);

            const minVal = Math.min(...points);
            const maxVal = Math.max(...points);
            const rangeVal = maxVal - minVal || 1;

            ctx.lineWidth = 1;
            ctx.strokeStyle = '#334155';
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px Roboto, sans-serif';

            const ySteps = 5;
            for (let i = 0; i <= ySteps; i++) {
                const yRatio = i / ySteps;
                const y = padding.top + chartH * yRatio;
                const val = maxVal - rangeVal * yRatio;

                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(w - padding.right, y);
                ctx.stroke();

                ctx.textAlign = 'right';
                ctx.fillText(formatNumber(val), padding.left - 10, y + 3);
            }

            if (times.length > 0) {
                const xSteps = 4;
                const step = Math.floor(times.length / xSteps);
                ctx.textAlign = 'center';
                for (let i = 0; i <= xSteps; i++) {
                    const idx = Math.min(i * step, times.length - 1);
                    const x = padding.left + (idx / (times.length - 1)) * chartW;
                    const date = new Date((times[idx] || 0) * 1000);

                    let labelStr;
                    if (range === '1d') {
                        labelStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } else {
                        labelStr = date.toLocaleDateString();
                    }

                    ctx.fillText(labelStr, x, h - 10);
                }
            }

            const getX = (i: number) => padding.left + (i / (points.length - 1)) * chartW;
            const getY = (val: number) => padding.top + chartH - ((val - minVal) / rangeVal) * chartH;

            const gradientLeft = padding.left;
            const gradientRight = w - padding.right;

            const getColor = (val: number) => (val >= 0 ? '#10b981' : '#f43f5e');

            const strokeGradient = ctx.createLinearGradient(gradientLeft, 0, gradientRight, 0);
            const fillGradient = ctx.createLinearGradient(gradientLeft, 0, gradientRight, 0);

            const isAllPositive = minVal >= 0;
            const isAllNegative = maxVal < 0;

            if (isAllPositive) {
                strokeGradient.addColorStop(0, '#10b981');
                strokeGradient.addColorStop(1, '#10b981');
                fillGradient.addColorStop(0, '#10b981');
                fillGradient.addColorStop(1, '#10b981');
            } else if (isAllNegative) {
                strokeGradient.addColorStop(0, '#f43f5e');
                strokeGradient.addColorStop(1, '#f43f5e');
                fillGradient.addColorStop(0, '#f43f5e');
                fillGradient.addColorStop(1, '#f43f5e');
            } else {
                // Mixed positive and negative - create gradient with color stops at each point
                strokeGradient.addColorStop(0, getColor(points[0]!));
                fillGradient.addColorStop(0, getColor(points[0]!));

                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i]!;
                    const p2 = points[i + 1]!;

                    // Calculate position of this point in the gradient (0 to 1)
                    const pos1 = i / (points.length - 1);
                    const pos2 = (i + 1) / (points.length - 1);

                    // If crossing zero between these two points
                    if ((p1 >= 0 && p2 < 0) || (p1 < 0 && p2 >= 0)) {
                        // Calculate exact crossing point
                        const ratio = Math.abs(p1) / (Math.abs(p1) + Math.abs(p2));
                        const crossPos = pos1 + (pos2 - pos1) * ratio;

                        // Add color stops at crossing point
                        strokeGradient.addColorStop(crossPos, getColor(p1));
                        strokeGradient.addColorStop(crossPos, getColor(p2));

                        fillGradient.addColorStop(crossPos, getColor(p1));
                        fillGradient.addColorStop(crossPos, getColor(p2));
                    }

                    // Add color stop at the next point position
                    strokeGradient.addColorStop(pos2, getColor(p2));
                    fillGradient.addColorStop(pos2, getColor(p2));
                }
            }

            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(getX(0), h - padding.bottom);
            points.forEach((val, i) => ctx.lineTo(getX(i), getY(val)));
            ctx.lineTo(getX(points.length - 1), h - padding.bottom);
            ctx.closePath();
            ctx.fillStyle = fillGradient;
            ctx.fill();
            ctx.restore();

            ctx.beginPath();
            points.forEach((val, i) => {
                if (i === 0) ctx.moveTo(getX(i), getY(val));
                else ctx.lineTo(getX(i), getY(val));
            });
            ctx.strokeStyle = strokeGradient;
            ctx.lineWidth = 2;
            ctx.stroke();
        };

        render();
        const observer = new ResizeObserver(render);
        observer.observe(container);
        window.addEventListener('resize', render);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', render);
        };
    }, [data, color, points, times, range]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current || points.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const xLocal = e.clientX - rect.left;

        const w = rect.width;
        const h = rect.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 60 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        if (xLocal < padding.left || xLocal > w - padding.right) {
            setTooltip(null);
            return;
        }

        const ratio = (xLocal - padding.left) / chartW;
        const index = Math.min(Math.max(Math.round(ratio * (points.length - 1)), 0), points.length - 1);

        const price = points[index]!;
        const time = times[index];

        const xPos = padding.left + (index / (points.length - 1)) * chartW;

        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        const rangeVal = maxVal - minVal || 1;
        const yPos = padding.top + chartH - ((price - minVal) / rangeVal) * chartH;

        setTooltip({
            x: xPos,
            y: yPos,
            price: formatNumber(price),
            date: time
                ? new Date(time * 1000).toLocaleString('pl-PL', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : '',
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
            <canvas ref={canvasRef} className="block w-full h-full" />

            {tooltip && (
                <>
                    <div
                        className="absolute top-5 bottom-8 border-l border-slate-500/50 border-dashed pointer-events-none"
                        style={{ left: tooltip.x }}
                    />
                    <div
                        className="absolute left-[60px] right-5 border-t border-slate-500/50 border-dashed pointer-events-none"
                        style={{ top: tooltip.y }}
                    />

                    <div
                        className="absolute w-3 h-3 bg-white rounded-full border-2 shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: tooltip.x, top: tooltip.y, borderColor: themeColor }}
                    />

                    <div
                        className="absolute bg-slate-800 text-white rounded-lg p-2 shadow-xl border border-slate-700 pointer-events-none z-20 whitespace-nowrap"
                        style={{
                            left: tooltip.x,
                            top: tooltip.y - 10,
                            transform: 'translate(-50%, -100%)'
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

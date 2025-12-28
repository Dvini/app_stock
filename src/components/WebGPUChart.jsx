import React, { useRef, useEffect, useState } from 'react';

export const WebGPUChart = ({ data = [], color = [0.16, 0.8, 0.45, 1.0], currency = 'PLN' }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    // Data parsing
    const hasObjects = data.length > 0 && typeof data[0] === 'object';
    const points = hasObjects ? data.map(d => d.price) : data;
    const times = hasObjects ? data.map(d => d.time) : [];

    // Colors
    const isNegative = color[0] > 0.5 && color[1] < 0.5; // Detection logic based on passed prop
    const themeColor = isNegative ? '#f43f5e' : '#10b981'; // Rose-500 or Emerald-500
    const themeRgb = isNegative ? '244, 63, 94' : '16, 185, 129';

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || points.length === 0) return;

        const ctx = canvas.getContext('2d');

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

            // Dimensions
            const padding = { top: 20, right: 20, bottom: 30, left: 60 };
            const chartW = w - padding.left - padding.right;
            const chartH = h - padding.top - padding.bottom;

            ctx.clearRect(0, 0, w, h);

            // Min/Max for Scaling
            const minVal = Math.min(...points);
            const maxVal = Math.max(...points);
            const range = maxVal - minVal || 1;

            // --- Grid & Axes ---
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#334155'; // Slate-700
            ctx.fillStyle = '#94a3b8'; // Slate-400
            ctx.font = '10px Roboto, sans-serif';

            // Y-Axis Grid & Labels (5 steps)
            const ySteps = 5;
            for (let i = 0; i <= ySteps; i++) {
                const yRatio = i / ySteps;
                const y = padding.top + chartH * yRatio;
                const val = maxVal - (range * yRatio);

                // Grid line
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(w - padding.right, y);
                ctx.stroke();

                // Label
                ctx.textAlign = 'right';
                ctx.fillText(val.toFixed(2), padding.left - 10, y + 3);
            }

            // X-Axis
            // Logic to pick nice dates based on data density
            // ... (Simple logic: first, last, and middle)
            if (times.length > 0) {
                const xSteps = 4;
                const step = Math.floor(times.length / xSteps);
                ctx.textAlign = 'center';
                for (let i = 0; i <= xSteps; i++) {
                    const idx = Math.min(i * step, times.length - 1);
                    const x = padding.left + (idx / (times.length - 1)) * chartW;
                    const date = new Date(times[idx] * 1000);
                    const dateStr = date.toLocaleDateString(); // e.g., 24.12
                    // const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    ctx.fillText(dateStr, x, h - 10);
                }
            }


            // --- Chart Path ---
            const getX = (i) => padding.left + (i / (points.length - 1)) * chartW;
            const getY = (val) => padding.top + chartH - ((val - minVal) / range) * chartH;

            // X-Axis Gradient Logic (Vertical Bands)
            // Color depends on the sign of the value at that specific X coordinate.
            // We scan for zero-crossings to create sharp transitions.

            const gradientLeft = padding.left;
            const gradientRight = w - padding.right;
            const gradientWidth = gradientRight - gradientLeft;

            // Custom Gradient Logic

            // Helper to get Color
            const getColor = (val) => val >= 0 ? '#10b981' : '#f43f5e';

            // 1. Stroke Gradient (Hard Edge)
            const strokeGradient = ctx.createLinearGradient(gradientLeft, 0, gradientRight, 0);

            // 2. Fill Gradient (Soft/Smoother Edge)
            const fillGradient = ctx.createLinearGradient(gradientLeft, 0, gradientRight, 0);

            // Optimization for single-color cases
            let isAllPositive = minVal >= 0;
            let isAllNegative = maxVal < 0;

            if (isAllPositive) {
                strokeGradient.addColorStop(0, '#10b981'); strokeGradient.addColorStop(1, '#10b981');
                fillGradient.addColorStop(0, '#10b981'); fillGradient.addColorStop(1, '#10b981');
            } else if (isAllNegative) {
                strokeGradient.addColorStop(0, '#f43f5e'); strokeGradient.addColorStop(1, '#f43f5e');
                fillGradient.addColorStop(0, '#f43f5e'); fillGradient.addColorStop(1, '#f43f5e');
            } else {
                // Mixed - Compute Stops
                strokeGradient.addColorStop(0, getColor(points[0]));
                fillGradient.addColorStop(0, getColor(points[0]));

                for (let i = 0; i < points.length - 1; i++) {
                    const p1 = points[i];
                    const p2 = points[i + 1];

                    // Check for Zero Crossing
                    if ((p1 >= 0 && p2 < 0) || (p1 < 0 && p2 >= 0)) {
                        const ratio = Math.abs(p1) / (Math.abs(p1) + Math.abs(p2));
                        const crossingIdx = i + ratio;
                        // Stop = (getX(crossingIdx) - gradientLeft) / gradientWidth.

                        const crossingX = getX(crossingIdx);
                        let stop = (crossingX - gradientLeft) / gradientWidth;
                        stop = Math.max(0, Math.min(1, stop));

                        // --- Hard Stroke ---
                        // Immediate switch
                        strokeGradient.addColorStop(stop, getColor(p1));
                        strokeGradient.addColorStop(stop, getColor(p2));

                        // --- Soft Fill ---
                        // Reduced smoothness as requested (very narrow blur)
                        const smoothness = 0.02; // 2% width
                        const start = Math.max(0, stop - smoothness);
                        const end = Math.min(1, stop + smoothness);

                        fillGradient.addColorStop(start, getColor(p1));
                        fillGradient.addColorStop(end, getColor(p2));
                    }
                }
                const lastColor = getColor(points[points.length - 1]);
                strokeGradient.addColorStop(1, lastColor);
                fillGradient.addColorStop(1, lastColor);
            }

            // 1. Area Fill
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

            // 2. Line Stroke
            ctx.beginPath();
            points.forEach((val, i) => {
                if (i === 0) ctx.moveTo(getX(i), getY(val));
                else ctx.lineTo(getX(i), getY(val));
            });
            ctx.strokeStyle = strokeGradient;
            ctx.lineWidth = 2; // Hard line
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
    }, [data, color]);

    // Custom Interaction Handler for React implementation of Tooltip Overlay
    // We separate the interaction to keep React render cycle clean
    const handleMouseMove = (e) => {
        if (!containerRef.current || points.length === 0) return;
        const rect = containerRef.current.getBoundingClientRect();
        const xLocal = e.clientX - rect.left;
        const yLocal = e.clientY - rect.top;

        // Dimensions must match render logic
        const w = rect.width;
        const h = rect.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 60 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        if (xLocal < padding.left || xLocal > w - padding.right) {
            setTooltip(null);
            return;
        }

        // Find Index
        const ratio = (xLocal - padding.left) / chartW;
        const index = Math.min(Math.max(Math.round(ratio * (points.length - 1)), 0), points.length - 1);

        const price = points[index];
        const time = times[index];

        // Calc coordinates for tooltip
        const xPos = padding.left + (index / (points.length - 1)) * chartW;

        const minVal = Math.min(...points);
        const maxVal = Math.max(...points);
        const range = maxVal - minVal || 1;
        const yPos = padding.top + chartH - ((price - minVal) / range) * chartH;

        setTooltip({
            x: xPos,
            y: yPos,
            price: price.toFixed(2),
            date: time ? new Date(time * 1000).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '',
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
                    {/* Crosshair X */}
                    <div className="absolute top-5 bottom-8 border-l border-slate-500/50 border-dashed pointer-events-none" style={{ left: tooltip.x }} />
                    {/* Crosshair Y */}
                    <div className="absolute left-[60px] right-5 border-t border-slate-500/50 border-dashed pointer-events-none" style={{ top: tooltip.y }} />

                    {/* Dot */}
                    <div
                        className="absolute w-3 h-3 bg-white rounded-full border-2 shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: tooltip.x, top: tooltip.y, borderColor: themeColor }}
                    />

                    {/* Tooltip Card */}
                    <div
                        className="absolute bg-slate-800 text-white rounded-lg p-2 shadow-xl border border-slate-700 pointer-events-none z-20 whitespace-nowrap"
                        style={{
                            left: tooltip.x,
                            top: tooltip.y - 10,
                            transform: 'translate(-50%, -100%)'
                        }}
                    >
                        <div className="font-bold text-sm">{tooltip.price} <span className="text-xs text-slate-400 font-normal">{currency}</span></div>
                        <div className="text-[10px] text-slate-400">{tooltip.date}</div>
                    </div>
                </>
            )}
        </div>
    );
};

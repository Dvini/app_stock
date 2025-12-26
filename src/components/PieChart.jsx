import React, { useRef, useEffect, useState } from 'react';

export const PieChart = ({ data, colors = [] }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [tooltip, setTooltip] = useState(null);

    // Default colors if not provided
    const defaultColors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
    ];
    const chartColors = colors.length ? colors : defaultColors;

    useEffect(() => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !data || data.length === 0) return;

        const ctx = canvas.getContext('2d');
        let animationId;

        // Process Data
        const total = data.reduce((acc, item) => acc + item.value, 0);
        let startAngle = -Math.PI / 2; // Start at 12 o'clock
        const slices = data.map((item, i) => {
            const angle = (item.value / total) * 2 * Math.PI;
            const slice = {
                start: startAngle,
                end: startAngle + angle,
                color: chartColors[i % chartColors.length],
                ...item
            };
            startAngle += angle;
            return slice;
        });

        const render = () => {
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            const w = rect.width;
            const h = rect.height;
            const centerX = w / 2;
            const centerY = h / 2;
            const radius = Math.min(centerX, centerY) * 0.8;
            const innerRadius = radius * 0.6; // Donut style

            ctx.clearRect(0, 0, w, h);

            slices.forEach((slice) => {
                ctx.beginPath();
                ctx.moveTo(centerX, centerY); // Needed for correct fill, but we'll mask center for donut
                ctx.arc(centerX, centerY, radius, slice.start, slice.end);
                // Donut hole
                ctx.arc(centerX, centerY, innerRadius, slice.end, slice.start, true);
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();

                ctx.strokeStyle = '#0f172a'; // Slate-900 border
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // Center Text (Total?)
            // ctx.fillStyle = '#fff';
            // ctx.font = 'bold 20px Inter, sans-serif';
            // ctx.textAlign = 'center';
            // ctx.textBaseline = 'middle';
            // ctx.fillText("Portfel", centerX, centerY);
        };

        render();
        const observer = new ResizeObserver(render);
        observer.observe(container);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(animationId);
        };
    }, [data]);

    const handleMouseMove = (e) => {
        if (!containerRef.current || !data) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate angle and radius
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = Math.min(centerX, centerY) * 0.8;
        const innerRadius = radius * 0.6;

        if (dist < innerRadius || dist > radius) {
            setTooltip(null);
            return;
        }

        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += 2 * Math.PI; // Normalize to start at -PI/2
        if (angle < -Math.PI / 2) angle += 2 * Math.PI; // Double check range

        // This angle calc is tricky due to -PI to PI range of atan2 vs 0-2PI logic
        // Easier: Map atan2 result to 0-2PI starting from -PI/2 (12 o'clock)

        // Standard atan2: -PI to PI (0 is 3 o'clock)
        // We drew starting at -PI/2.

        let normalizedAngle = angle + Math.PI / 2;
        if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;

        // Find slice
        const total = data.reduce((acc, item) => acc + item.value, 0);
        let currentAngle = 0;

        for (let i = 0; i < data.length; i++) {
            const sliceAngle = (data[i].value / total) * 2 * Math.PI;
            if (normalizedAngle >= currentAngle && normalizedAngle < currentAngle + sliceAngle) {
                // Found it
                setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    label: data[i].label,
                    value: data[i].value,
                    percent: (data[i].value / total * 100).toFixed(1) + '%',
                    pl: data[i].pl,
                    color: chartColors[i % chartColors.length]
                });
                return;
            }
            currentAngle += sliceAngle;
        }
        setTooltip(null);
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
            {tooltip && (
                <div
                    className="absolute bg-slate-800 text-white rounded-lg p-3 shadow-xl border border-slate-700 pointer-events-none z-20 min-w-[120px]"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: 'translate(10px, 10px)'
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
                        <div className={`text-xs mt-1 font-bold ${tooltip.pl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {tooltip.pl}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

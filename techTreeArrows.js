// techTreeArrows.js — продвинутая отрисовка связей (без стрелок)
import { state } from './state.js';
import { isRevealed } from './script.js';

export function drawArrows(pos) {
    if (!state.svg) return;
    state.svg.innerHTML = '';
    const svgNS = "http://www.w3.org/2000/svg";

    // ======================================================
    // DEPENDENCIES
    // ======================================================
    const dependents = {};
    Object.entries(state.data.technologies).forEach(([id, tech]) => {
        (tech.requires || []).forEach(req => {
            const reqId = typeof req === 'string' ? req : req.id;
            if (!dependents[reqId]) dependents[reqId] = [];
            dependents[reqId].push(id);
        });
    });

    const arrows = [];
    Object.entries(dependents).forEach(([fromId, toIds]) => {
        if (!pos[fromId]) return;
        toIds.forEach((toId, index) => {
            if (!pos[toId]) return;

            const start = pos[fromId];
            const end = pos[toId];
            const dx = end.x - start.x;
            const dy = end.y - start.y;

            const isLeft = dx < 0;
            const isFarX = Math.abs(dx) > 260;
            const isFarY = Math.abs(dy) > 160;

            const isRevealedTo = isRevealed(toId);
            const isResearchingSource = state.currentlyResearching.has(fromId);
            const isActive = isRevealedTo || isResearchingSource || state.currentlyResearching.has(toId);

            const offset = isActive ? (index % 3 - 1) * 0.9 : 0;
            const startY = start.y + offset * 0.5;
            const endY = end.y + offset;
            const startX = start.x;
            const endX = end.x;

            const exitX = startX + (isLeft ? -60 : 60);
            const entryX = endX + (isLeft ? 70 : -60);

            let points;
            if (!isFarX && !isFarY) {
                points = [
                    { x: startX, y: startY },
                    { x: exitX, y: startY },
                    { x: exitX, y: endY },
                    { x: endX, y: endY }
                ];
            } else {
                const midX = (startX + endX) / 2;
                points = [
                    { x: startX, y: startY },
                    { x: exitX, y: startY },
                    { x: midX, y: startY },
                    { x: midX, y: endY },
                    { x: entryX, y: endY },
                    { x: endX, y: endY }
                ];
            }

            arrows.push({
                d: makePathD(points),
                points,
                active: isActive,
                isResearchingSource: isResearchingSource,
                fromId,
                toId
            });
        });
    });

    arrows.sort((a, b) => (a.active ? 1 : 0) - (b.active ? 1 : 0));

    arrows.forEach(a => {
        // ==================== БАЗОВАЯ ЛИНИЯ (БЕЗ МАРКЕРА) ====================
        const basePath = document.createElementNS(svgNS, "path");
        basePath.setAttribute("d", a.d);
        basePath.setAttribute("fill", "none");
        basePath.setAttribute("stroke-width", "3");
        // УДАЛЕНО: marker-end
        basePath.setAttribute("stroke-linecap", "round");
        basePath.setAttribute("stroke-linejoin", "round");

        if (a.active) {
            basePath.setAttribute("stroke", "#6fb8ff");
            basePath.setAttribute("opacity", "0.92");
            basePath.style.filter = "drop-shadow(0 0 4px rgba(120,200,255,0.5))";
            basePath.style.animation = "linePulse 2.4s ease-in-out infinite";
        } else {
            basePath.setAttribute("stroke", "#444a5a");
            basePath.setAttribute("opacity", "0.55");
        }
        state.svg.appendChild(basePath);

        // ==================== КОНВЕЙЕР (БЕЗ ИЗМЕНЕНИЙ) ====================
        if (a.active) {
            const flowPath = document.createElementNS(svgNS, "path");
            flowPath.setAttribute("d", a.d);
            flowPath.setAttribute("fill", "none");
            flowPath.setAttribute("stroke-linecap", "round");
            flowPath.setAttribute("stroke-linejoin", "round");
            flowPath.setAttribute("pointer-events", "none");

            const length = computePathLength(a.points);

            if (a.isResearchingSource) {
                flowPath.setAttribute("stroke", "#14ffcc");
                flowPath.setAttribute("stroke-width", "2.4");
                flowPath.setAttribute("opacity", "0.85");
                flowPath.style.filter = "drop-shadow(0 0 6px #14ffcc) drop-shadow(0 0 12px #14ffcc)";

                const dashLen = clamp(length * 0.021, 3.5, 7);
                const gapLen = clamp(length * 0.078, 9, 20);
                flowPath.setAttribute("stroke-dasharray", `${dashLen.toFixed(2)} ${gapLen.toFixed(2)}`);
                flowPath.style.animation = `
                    dashFlow ${clamp(length / 25, 7.5, 12)}s linear infinite,
                    conveyorPulse ${2.8}s ease-in-out infinite
                `;
            } else {
                flowPath.setAttribute("stroke", "#eafcff");
                flowPath.setAttribute("stroke-width", "1.2");
                flowPath.setAttribute("opacity", "0.35");

                const dashLen = clamp(length * 0.025, 2.0, 4.5);
                const gapLen = clamp(length * 0.08, 8.0, 18.0);
                flowPath.setAttribute("stroke-dasharray", `${dashLen.toFixed(2)} ${gapLen.toFixed(2)}`);
                const duration = clamp(length / 35, 7, 11) * 2;
                flowPath.style.animation = `dashFlow ${duration.toFixed(1)}s linear infinite`;
            }
            state.svg.appendChild(flowPath);
        }
    });

    // HELPERS
    function makePathD(points) {
        return points.map((p, i) => i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    }

    function computePathLength(points) {
        let len = 0;
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            len += Math.abs(dx) + Math.abs(dy);
        }
        return len;
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    // CSS
    if (!document.getElementById("techTreeArrowsStyle")) {
        const style = document.createElement("style");
        style.id = "techTreeArrowsStyle";
        style.textContent = `
            @keyframes linePulse { 0% { opacity: 0.75; } 50% { opacity: 1; } 100% { opacity: 0.75; } }
            @keyframes dashFlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -1200; } }
            @keyframes conveyorPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.98; } }
        `;
        document.head.appendChild(style);
    }
}

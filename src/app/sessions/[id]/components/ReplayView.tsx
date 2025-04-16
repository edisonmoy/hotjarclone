"use client";

import { useRef, useEffect, useState } from "react";
import { CanvasElement } from "./types";
import DomRenderer from "./DomRenderer";

interface ReplayViewProps {
    viewportSize: { width: number; height: number };
    scale: number;
    reconstructedDom: string;
    canvasSnapshots: CanvasElement[];
    cursorPosition: { x: number; y: number };
    clickEffect: { x: number; y: number; show: boolean };
    sourceUrl?: string;
    cssUrls?: string[]; // Additional CSS URLs to load
}

const ReplayView = ({
    viewportSize,
    scale,
    reconstructedDom,
    canvasSnapshots,
    cursorPosition,
    clickEffect,
    sourceUrl,
}: ReplayViewProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [computedScale, setComputedScale] = useState(scale);
    const [contentPosition, setContentPosition] = useState({ x: 0, y: 0 });

    // Calculate proper scaling and positioning based on container size
    useEffect(() => {
        if (!containerRef.current) return;

        const updateScaleAndPosition = () => {
            const containerWidth = containerRef.current?.clientWidth || 0;
            const containerHeight = containerRef.current?.clientHeight || 0;

            // Use the original dimensions from viewportSize
            const sessionWidth = viewportSize.width;
            const sessionHeight = viewportSize.height;

            // Calculate the scale to fit content within the container
            const scaleX = containerWidth / sessionWidth;
            const scaleY = containerHeight / sessionHeight;

            // Use the minimum scale to ensure full content visibility without distortion
            // Cap at the parent-provided scale to prevent oversizing
            const bestScale = Math.min(scaleX, scaleY, scale);

            // Center the content within the container
            const scaledWidth = sessionWidth * bestScale;
            const scaledHeight = sessionHeight * bestScale;
            const leftOffset = Math.max(
                0,
                Math.floor((containerWidth - scaledWidth) / 2)
            );
            const topOffset = Math.max(
                0,
                Math.floor((containerHeight - scaledHeight) / 2)
            );

            setComputedScale(bestScale);
            setContentPosition({ x: leftOffset, y: topOffset });

            // Apply transform directly to ensure it's in sync with our state
            if (contentRef.current) {
                contentRef.current.style.transform = `scale(${bestScale})`;
                contentRef.current.style.width = `${sessionWidth}px`;
                contentRef.current.style.height = `${sessionHeight}px`;
            }
        };

        updateScaleAndPosition();

        // Recalculate on window resize
        const resizeObserver = new ResizeObserver(updateScaleAndPosition);
        resizeObserver.observe(containerRef.current);

        return () => {
            if (containerRef.current) {
                resizeObserver.unobserve(containerRef.current);
            }
        };
    }, [viewportSize.width, viewportSize.height, scale]);

    // Transform coordinates from the original session space to the scaled and positioned display
    const transformCoordinates = (x: number, y: number) => {
        return {
            x: Math.round(x * computedScale + contentPosition.x),
            y: Math.round(y * computedScale + contentPosition.y),
        };
    };

    // Transform the cursor position
    const transformedCursorPosition = transformCoordinates(
        cursorPosition.x,
        cursorPosition.y
    );

    // Transform the click effect position
    const transformedClickPosition = transformCoordinates(
        clickEffect.x,
        clickEffect.y
    );

    return (
        <div
            ref={containerRef}
            className="bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden h-full w-full"
        >
            <div
                className="relative bg-white shadow-lg overflow-hidden"
                style={{
                    width: `${viewportSize.width * computedScale}px`,
                    height: `${viewportSize.height * computedScale}px`,
                    position: "relative",
                    left: `${contentPosition.x}px`,
                    top: `${contentPosition.y}px`,
                }}
                data-scale={computedScale}
                data-offset-x={contentPosition.x}
                data-offset-y={contentPosition.y}
                data-session-width={viewportSize.width}
                data-session-height={viewportSize.height}
            >
                {/* Scaled container for DOM content */}
                <div
                    ref={contentRef}
                    className="absolute top-0 left-0 origin-top-left"
                    style={{
                        transform: `scale(${computedScale})`,
                        width: `${viewportSize.width}px`,
                        height: `${viewportSize.height}px`,
                    }}
                >
                    <DomRenderer
                        html={reconstructedDom}
                        canvasSnapshots={canvasSnapshots}
                        sourceUrl={sourceUrl}
                    />
                </div>

                {/* Cursor */}
                <div
                    className="absolute w-4 h-4 pointer-events-none z-50"
                    style={{
                        left: transformedCursorPosition.x,
                        top: transformedCursorPosition.y,
                        transform: "translate(-50%, -50%)",
                        background: "rgba(255, 0, 0, 0.5)",
                        borderRadius: "50%",
                        transition: "all 0.05s linear",
                    }}
                />

                {/* Click effect */}
                {clickEffect.show && (
                    <div
                        className="absolute w-8 h-8 pointer-events-none z-40 animate-ping"
                        style={{
                            left: transformedClickPosition.x,
                            top: transformedClickPosition.y,
                            transform: "translate(-50%, -50%)",
                            border: "2px solid red",
                            borderRadius: "50%",
                        }}
                    />
                )}

                {/* Debug overlay in development */}
                {process.env.NODE_ENV === "development" && (
                    <div className="absolute bottom-0 left-0 text-xs bg-black bg-opacity-75 text-white p-1 pointer-events-none z-50">
                        Scale: {computedScale.toFixed(2)} | Session:{" "}
                        {viewportSize.width}×{viewportSize.height} | Cursor:{" "}
                        {transformedCursorPosition.x},
                        {transformedCursorPosition.y}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReplayView;

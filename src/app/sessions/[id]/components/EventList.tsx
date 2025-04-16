"use client";

import { useState } from "react";

interface EventListProps {
    events: any[];
    currentTime: number;
}

const EventList = ({ events, currentTime }: EventListProps) => {
    const [collapsedEvents, setCollapsedEvents] = useState<
        Record<number, boolean>
    >({});

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    };

    const toggleEventCollapse = (index: number) => {
        setCollapsedEvents((prev) => ({
            ...prev,
            [index]: !prev[index],
        }));
    };

    return (
        <div className="border rounded-lg overflow-hidden flex flex-col">
            <div className="p-2 border-b flex justify-between items-center">
                <h2 className="text-sm font-semibold">Event Log</h2>
                <span className="text-xs text-gray-500">
                    {events.length} events
                </span>
            </div>
            <div className="flex-1 overflow-y-auto">
                {events.map((event, index) => {
                    // Check for commonly displayed fields
                    const hasPosition =
                        event.data?.x !== undefined &&
                        event.data?.y !== undefined;
                    const isCollapsed = collapsedEvents[index] !== false; // Default to collapsed

                    return (
                        <div
                            key={index}
                            className={`px-2 py-1 border-b border-gray-100 text-xs ${
                                event.timestamp <= currentTime
                                    ? "bg-blue-50"
                                    : ""
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span
                                    className={`font-medium ${
                                        event.timestamp <= currentTime
                                            ? "text-blue-700"
                                            : ""
                                    }`}
                                >
                                    {event.type}
                                </span>
                                <span className="text-gray-500 text-xs">
                                    {formatTime(event.timestamp)}
                                </span>
                            </div>

                            {/* Simplified data preview */}
                            {hasPosition && (
                                <div className="text-xs text-gray-600 mt-0.5">
                                    Position: ({event.data.x}, {event.data.y})
                                </div>
                            )}

                            {/* Collapsible data details */}
                            {event.data && (
                                <div className="mt-1">
                                    <button
                                        onClick={() =>
                                            toggleEventCollapse(index)
                                        }
                                        className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                                    >
                                        <span className="mr-1">
                                            {isCollapsed ? "+" : "-"}
                                        </span>
                                        {isCollapsed
                                            ? "Show details"
                                            : "Hide details"}
                                    </button>

                                    {!isCollapsed && (
                                        <pre className="mt-1 text-xs bg-white p-1 rounded border text-gray-700 overflow-x-auto">
                                            {JSON.stringify(
                                                event.data,
                                                null,
                                                2
                                            )}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default EventList;

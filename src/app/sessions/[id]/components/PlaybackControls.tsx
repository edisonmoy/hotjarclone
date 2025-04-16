"use client";

import { useCallback } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

interface PlaybackControlsProps {
    isPlaying: boolean;
    currentTime: number;
    totalDuration: number;
    playbackSpeed: number;
    sessionId: string;
    sessionStartTime: string | null;
    onPlayPause: () => void;
    onSpeedChange: (speed: number) => void;
    onTimelineChange: (time: number) => void;
}

const PlaybackControls = ({
    isPlaying,
    currentTime,
    totalDuration,
    playbackSpeed,
    sessionId,
    sessionStartTime,
    onPlayPause,
    onSpeedChange,
    onTimelineChange,
}: PlaybackControlsProps) => {
    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    };

    const handleSpeedChange = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            const speed = Number(
                (e.currentTarget as HTMLButtonElement).textContent?.replace(
                    "x",
                    ""
                )
            );
            if (!isNaN(speed)) {
                onSpeedChange(speed);
            }
        },
        [onSpeedChange]
    );

    return (
        <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
                <div>{sessionId}</div>
                <div className="text-sm text-gray-600">
                    {sessionStartTime
                        ? (() => {
                              const date = new Date(sessionStartTime);
                              const options: Intl.DateTimeFormatOptions = {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                              };
                              return date.toLocaleDateString("en-US", options);
                          })()
                        : "Loading..."}
                </div>
            </div>
            <div className="flex items-center space-x-4">
                <button
                    onClick={onPlayPause}
                    className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors flex items-center justify-center w-10 h-10"
                >
                    {isPlaying ? (
                        <Pause size={18} />
                    ) : currentTime >= totalDuration ? (
                        <RotateCcw size={18} />
                    ) : (
                        <Play size={18} />
                    )}
                </button>
                <div className="flex space-x-2">
                    {[0.5, 1, 2, 4].map((speed) => (
                        <button
                            key={speed}
                            onClick={handleSpeedChange}
                            className={`px-2 py-1 rounded transition-colors ${
                                playbackSpeed === speed
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-200 hover:bg-gray-300"
                            }`}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>
                <div className="flex-1 flex items-center space-x-2">
                    <input
                        type="range"
                        min="0"
                        max={totalDuration.toString()}
                        value={currentTime}
                        onChange={(e) =>
                            onTimelineChange(Number(e.target.value))
                        }
                        className="flex-1"
                    />
                    <div className="text-sm whitespace-nowrap">
                        {formatTime(currentTime)} / {formatTime(totalDuration)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlaybackControls;

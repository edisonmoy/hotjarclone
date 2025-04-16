"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
    Session,
    SessionChunk,
    NormalizedEvent,
    CanvasElement,
    Event as SessionEvent,
} from "./components/types";
import PlaybackControls from "./components/PlaybackControls";
import EventList from "./components/EventList";
import ReplayView from "./components/ReplayView";

export default function SessionReplayPage() {
    const params = useParams();
    const sessionId = params.id as string;
    const [session, setSession] = useState<Session | null>(null);
    const [events, setEvents] = useState<NormalizedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
    const [clickEffect, setClickEffect] = useState<{
        x: number;
        y: number;
        show: boolean;
    }>({ x: 0, y: 0, show: false });
    const playbackInterval = useRef<NodeJS.Timeout | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [scale, setScale] = useState(1);
    const [currentUrl, setCurrentUrl] = useState<string | undefined>(undefined);
    const [canvasSnapshots, setCanvasSnapshots] = useState<CanvasElement[]>([]);
    const replayStateRef = useRef<{ currentTime: number }>({ currentTime: 0 });
    const [reconstructedDom, setReconstructedDom] = useState<string>("");

    // Update replayStateRef when currentTime changes (for animation frame sync)
    useEffect(() => {
        replayStateRef.current.currentTime = currentTime;
    }, [currentTime]);

    // Get session start time from the first event
    const getSessionStartTime = useCallback(() => {
        if (events.length === 0) return null;
        const firstEvent = events[0];
        return firstEvent.data?.timestamp || null;
    }, [events]);

    // Calculate total duration from actual events
    const getTotalDuration = useCallback(() => {
        if (events.length === 0) return 0;
        return events[events.length - 1].timestamp;
    }, [events]);

    // Clean up unused DrawCanvasElements component and use standard canvas render
    const handleResetPlayback = () => {
        setCurrentTime(0);
        if (isPlaying) {
            setIsPlaying(false);
        }

        // Reset to initial snapshot
        const initialSnapshot = events.find((e) => e.type === "dom_snapshot");

        if (initialSnapshot?.data.html) {
            setReconstructedDom(initialSnapshot.data.html);
        }
    };

    const handleRestartPlayback = () => {
        handleResetPlayback();
        setIsPlaying(true);
    };

    // Update playback methods
    const handlePlayPause = () => {
        if (currentTime >= getTotalDuration()) {
            // If at the end, restart from beginning
            handleRestartPlayback();
        } else {
            setIsPlaying(!isPlaying);
        }
    };

    // Update method that handles stopping at the end of replay
    const checkPlaybackEnd = useCallback(
        (nextTime: number) => {
            if (nextTime >= getTotalDuration()) {
                setIsPlaying(false);
                return getTotalDuration();
            }
            return nextTime;
        },
        [getTotalDuration]
    );

    const fetchSessionData = async () => {
        try {
            setLoading(true);

            // Step 1: Fetch session data
            const sessionResponse = await fetch(
                `/api/sessions?id=${sessionId}`
            );

            if (!sessionResponse.ok) {
                throw new Error("Failed to fetch session details");
            }

            const sessionData = await sessionResponse.json();
            setSession(sessionData);
            console.log(sessionData);

            if (sessionData?.url) {
                setCurrentUrl(sessionData.url);
            }

            // Step 2: Fetch session chunks to get events
            const chunksResponse = await fetch(
                `/api/sessions/chunks?sessionId=${sessionId}`
            );

            if (!chunksResponse.ok) {
                throw new Error("Failed to fetch session chunks");
            }

            const chunksData: SessionChunk[] = await chunksResponse.json();

            // Process chunks to get events
            if (chunksData && chunksData.length > 0) {
                // Extract and sort all events from chunks
                const allEvents = chunksData
                    .flatMap((chunk: SessionChunk) => chunk.events || [])
                    .filter((event: SessionEvent) => event && event.data)
                    .sort((a: SessionEvent, b: SessionEvent) => {
                        const timeA = new Date(
                            a.data?.timestamp || 0
                        ).getTime();
                        const timeB = new Date(
                            b.data?.timestamp || 0
                        ).getTime();
                        return timeA - timeB;
                    });

                if (allEvents.length > 0) {
                    const firstEvent = allEvents[0];
                    const firstEventTime = new Date(
                        firstEvent.data?.timestamp || 0
                    ).getTime();

                    // Set viewport size from session_start event
                    const sessionStartEvent = allEvents.find(
                        (e: SessionEvent) => e.type === "session_start"
                    );

                    if (sessionStartEvent?.data?.viewportSize) {
                        const [width, height] =
                            sessionStartEvent.data.viewportSize
                                .split("x")
                                .map(Number);
                        if (!isNaN(width) && !isNaN(height)) {
                            setViewportSize({ width, height });
                        }
                    }

                    // Normalize timestamps relative to the first event
                    const normalizedEvents: NormalizedEvent[] = allEvents.map(
                        (event: SessionEvent) => ({
                            ...event,
                            timestamp:
                                new Date(event.data?.timestamp || 0).getTime() -
                                firstEventTime,
                        })
                    );

                    setEvents(normalizedEvents);

                    // Set initial DOM state
                    const initialDomSnapshot = normalizedEvents.find(
                        (e: NormalizedEvent) =>
                            e.type === "dom_snapshot" && e.data.html
                    );

                    if (initialDomSnapshot?.data.html) {
                        setReconstructedDom(initialDomSnapshot.data.html);

                        if (initialDomSnapshot.data.canvasElements) {
                            setCanvasSnapshots(
                                initialDomSnapshot.data.canvasElements
                            );
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching session data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Handle timeline changes
    const handleTimelineChange = (newTime: number) => {
        setCurrentTime(newTime);
        if (isPlaying && newTime >= getTotalDuration()) {
            setIsPlaying(false);
        }

        // Update cursor position to match the new time
        const lastEventBeforeTime = [...events]
            .reverse()
            .find(
                (e) =>
                    (e.type === "mousemove" || e.type === "click") &&
                    e.timestamp <= newTime
            );

        if (
            lastEventBeforeTime?.data &&
            lastEventBeforeTime.data.x !== undefined &&
            lastEventBeforeTime.data.y !== undefined
        ) {
            setCursorPosition({
                x: lastEventBeforeTime.data.x,
                y: lastEventBeforeTime.data.y,
            });
        }

        // Find the most recent DOM snapshot before this time
        const lastDomSnapshot = [...events]
            .filter((e) => e.type === "dom_snapshot" && e.timestamp <= newTime)
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        // Update the DOM with the snapshot
        if (lastDomSnapshot?.data?.html) {
            setReconstructedDom(lastDomSnapshot.data.html);

            // Also update canvas if available
            if (lastDomSnapshot.data.canvasElements) {
                setCanvasSnapshots(lastDomSnapshot.data.canvasElements);
            }
        }

        // Update URL if needed
        const lastUrlChange = [...events]
            .filter(
                (e) =>
                    e.type === "session_start" &&
                    e.data?.url &&
                    e.timestamp <= newTime
            )
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (lastUrlChange?.data?.url) {
            setCurrentUrl(lastUrlChange.data.url);
        }
    };

    // Handle playback and interactions
    useEffect(() => {
        if (playbackInterval.current) {
            clearInterval(playbackInterval.current);
            playbackInterval.current = null;
        }

        if (isPlaying) {
            playbackInterval.current = setInterval(() => {
                setCurrentTime((prevTime) => {
                    const nextTime = prevTime + 50 * playbackSpeed;
                    const newTime = checkPlaybackEnd(nextTime);

                    // Process events that occurred between prevTime and newTime
                    const currentEvents = events.filter(
                        (e) => e.timestamp <= newTime && e.timestamp > prevTime
                    );

                    // Apply all events in order
                    currentEvents.forEach((event) => {
                        // Handle mouse movements
                        if (
                            event.type === "mousemove" &&
                            event.data.x !== undefined &&
                            event.data.y !== undefined
                        ) {
                            setCursorPosition({
                                x: event.data.x,
                                y: event.data.y,
                            });
                        }

                        // Handle clicks
                        if (
                            event.type === "click" &&
                            event.data.x !== undefined &&
                            event.data.y !== undefined
                        ) {
                            setCursorPosition({
                                x: event.data.x,
                                y: event.data.y,
                            });

                            setClickEffect({
                                x: event.data.x,
                                y: event.data.y,
                                show: true,
                            });

                            // Hide click effect after animation
                            setTimeout(() => {
                                setClickEffect((prev) => ({
                                    ...prev,
                                    show: false,
                                }));
                            }, 500);
                        }

                        // Handle DOM snapshots
                        if (event.type === "dom_snapshot" && event.data.html) {
                            console.log(
                                `Processing DOM snapshot event at time ${event.timestamp}ms`,
                                {
                                    htmlLength: event.data.html.length,
                                    hasDoctype: Boolean(event.data.doctype),
                                    canvasElements:
                                        event.data.canvasElements?.length || 0,
                                }
                            );
                            setReconstructedDom(event.data.html);
                            if (event.data.canvasElements) {
                                setCanvasSnapshots(event.data.canvasElements);
                            }
                        }

                        // Update URL on navigation
                        if (event.type === "session_start" && event.data.url) {
                            setCurrentUrl(event.data.url);
                        }
                    });

                    return newTime;
                });
            }, 50); // Update every 50ms
        }

        return () => {
            if (playbackInterval.current) {
                clearInterval(playbackInterval.current);
            }
        };
    }, [isPlaying, playbackSpeed, events, checkPlaybackEnd]);

    // Add a new useEffect to log detailed event data
    useEffect(() => {
        if (events.length > 0) {
            // Log event types for debugging
            const eventTypes = events.map((e) => e.type);
            const uniqueEventTypes = [...new Set(eventTypes)];
            console.log("Available event types:", uniqueEventTypes);
            console.log("Total events:", events.length);

            // Check if we have any DOM-related events
            const hasDomSnapshots = events.some(
                (e) => e.type === "dom_snapshot"
            );
            const hasDomMutations = events.some(
                (e) => e.type === "dom_mutation"
            );
            const hasFormChanges = events.some((e) => e.type === "form_change");
            const hasCanvasUpdates = events.some(
                (e) => e.type === "canvas_update"
            );

            console.log("DOM data available:", {
                hasDomSnapshots,
                hasDomMutations,
                hasFormChanges,
                hasCanvasUpdates,
            });
        }
    }, [events]);

    // Add a useEffect to log session loading
    useEffect(() => {
        if (session) {
            console.log("Session loaded:", session.id, "URL:", session.url);

            // If we have a session but no currentUrl, try to set it
            if (!currentUrl && session.url) {
                console.log("Setting currentUrl from session");
                setCurrentUrl(session.url);
            }
        }
    }, [session, currentUrl]);

    // Reset playback when component unmounts
    useEffect(() => {
        fetchSessionData();
        return () => {
            // Cleanup interval on unmount
            if (playbackInterval.current) {
                clearInterval(playbackInterval.current);
            }
        };
    }, [sessionId]);

    // Handle viewport scaling based on container size
    useEffect(() => {
        const handleResize = () => {
            const containerWidth = window.innerWidth * 0.66; // Approx 2/3 of screen for container
            const containerHeight = window.innerHeight - 200; // Adjust for header/controls

            if (viewportSize.width && viewportSize.height) {
                const scaleX = containerWidth / viewportSize.width;
                const scaleY = containerHeight / viewportSize.height;
                setScale(Math.min(scaleX, scaleY, 1)); // Never scale up, only down
            }
        };

        handleResize();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [viewportSize]);

    if (loading) {
        return <div className="p-4">Loading session...</div>;
    }

    if (!session) {
        return <div className="p-4">Session not found</div>;
    }

    const totalDuration = getTotalDuration();
    const sessionStartTime = getSessionStartTime();
    return (
        <div className="h-full flex flex-col text-xs">
            <PlaybackControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                totalDuration={totalDuration}
                playbackSpeed={playbackSpeed}
                sessionId={sessionId}
                sessionStartTime={sessionStartTime}
                onPlayPause={handlePlayPause}
                onSpeedChange={setPlaybackSpeed}
                onTimelineChange={handleTimelineChange}
            />

            <div className="flex-1 grid grid-cols-[2fr,1fr] gap-4 p-4 overflow-hidden">
                <ReplayView
                    viewportSize={viewportSize}
                    scale={scale}
                    reconstructedDom={reconstructedDom}
                    canvasSnapshots={canvasSnapshots}
                    cursorPosition={cursorPosition}
                    clickEffect={clickEffect}
                    sourceUrl={currentUrl}
                />

                <EventList events={events} currentTime={currentTime} />
            </div>
        </div>
    );
}

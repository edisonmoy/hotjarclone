"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { Trash2 } from "lucide-react";
import Navbar from "../components/Navbar";

interface Session {
    id: string;
    url: string;
    created_at: string;
    viewport_size: string;
    start_time?: string;
    end_time?: string;
}

export default function SessionsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams();

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            setRefreshing(true);
            const response = await fetch("/api/sessions");
            if (!response.ok) throw new Error("Failed to fetch sessions");
            const data = await response.json();
            setSessions(data);
        } catch (error) {
            console.error("Error fetching sessions:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this session?")) return;

        try {
            setDeleting(sessionId);
            const response = await fetch(`/api/sessions?id=${sessionId}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete session");

            setSessions((prev) => prev.filter((s) => s.id !== sessionId));

            if (params.id === sessionId) {
                router.push("/sessions");
            }
        } catch (error) {
            console.error("Error deleting session:", error);
            alert("Failed to delete session");
        } finally {
            setDeleting(null);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);

        const options: Intl.DateTimeFormatOptions = {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        };

        return date.toLocaleDateString("en-US", options);
    };

    const calculateDuration = (startTime?: string, endTime?: string) => {
        if (!startTime || !endTime) return null;

        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();

        if (isNaN(start) || isNaN(end) || start > end) return null;

        const durationMs = end - start;
        const seconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    };

    const handleSessionClick = (sessionId: string) => {
        router.push(`/sessions/${sessionId}`);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex text-xs">
            {/* Navbar */}
            <Navbar />

            {/* Main Content */}
            <div className="flex-1 flex">
                {/* Sessions List */}
                <div className="w-80 border-r overflow-y-auto">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="text-lg font-bold">Sessions</h2>
                        <button
                            onClick={fetchSessions}
                            disabled={refreshing}
                            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs flex items-center space-x-1 disabled:opacity-70"
                            title="Refresh sessions"
                        >
                            {refreshing ? (
                                <>
                                    <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin mr-1"></span>
                                    <span>Refreshing...</span>
                                </>
                            ) : (
                                <span>Refresh</span>
                            )}
                        </button>
                    </div>
                    <div className="divide-y">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={`group relative ${
                                    params.id === session.id
                                        ? "bg-blue-50"
                                        : "hover:bg-gray-50"
                                }`}
                            >
                                <button
                                    onClick={() =>
                                        handleSessionClick(session.id)
                                    }
                                    className="w-full p-4 text-left transition-colors"
                                >
                                    <div className="text-sm font-medium truncate">
                                        {session.url}
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>
                                            {formatDate(session.created_at)}
                                        </span>
                                        {(() => {
                                            const duration = calculateDuration(
                                                session.start_time,
                                                session.end_time
                                            );
                                            return duration ? (
                                                <span>
                                                    Duration: {duration}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => handleDelete(session.id, e)}
                                    disabled={deleting === session.id}
                                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full
                                        opacity-0 group-hover:opacity-100 transition-opacity
                                        hover:bg-red-100 text-red-600 disabled:opacity-50`}
                                    title="Delete session"
                                >
                                    {deleting === session.id ? (
                                        <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Trash2 size={16} />
                                    )}
                                </button>
                            </div>
                        ))}
                        {sessions.length === 0 && !loading && (
                            <div className="p-4 text-center text-gray-500">
                                No sessions recorded yet
                            </div>
                        )}
                        {loading && (
                            <div className="p-4 text-center text-gray-500">
                                Loading sessions...
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden">
                    {pathname === "/sessions" ? (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            Select a session to view the replay
                        </div>
                    ) : (
                        children
                    )}
                </div>
            </div>
        </div>
    );
}

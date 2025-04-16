"use client";

import Navbar from "../components/Navbar";

export default function KeysLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gray-50 flex text-xs">
            <Navbar />
            <div className="flex-1 overflow-auto">{children}</div>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { Trash2, Copy } from "lucide-react";

interface ApiKey {
    key: string;
    allowed_url: string;
    created_at: string;
}

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [newUrl, setNewUrl] = useState("");
    const [creating, setCreating] = useState(false);
    const [scriptUrl, setScriptUrl] = useState("");

    useEffect(() => {
        fetchKeys();
        setScriptUrl(`${window.location.origin}/recording-script.js`);
    }, []);

    const fetchKeys = async () => {
        try {
            const response = await fetch("/api/keys");
            if (!response.ok) throw new Error("Failed to fetch keys");
            const data = await response.json();
            setKeys(data);
        } catch (error) {
            console.error("Error fetching keys:", error);
        } finally {
            setLoading(false);
        }
    };

    const createKey = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setCreating(true);
            const response = await fetch("/api/keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: newUrl }),
            });

            if (!response.ok) throw new Error("Failed to create key");

            const { apiKey } = await response.json();
            setKeys((prev) => [
                {
                    key: apiKey,
                    allowed_url: newUrl,
                    created_at: new Date().toISOString(),
                },
                ...prev,
            ]);
            setNewUrl("");
        } catch (error) {
            console.error("Error creating key:", error);
            alert("Failed to create API key");
        } finally {
            setCreating(false);
        }
    };

    const deleteKey = async (key: string) => {
        if (!confirm("Are you sure you want to delete this API key?")) return;

        try {
            const response = await fetch(`/api/keys?key=${key}`, {
                method: "DELETE",
            });

            if (!response.ok) throw new Error("Failed to delete key");

            setKeys((prev) => prev.filter((k) => k.key !== key));
        } catch (error) {
            console.error("Error deleting key:", error);
            alert("Failed to delete API key");
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert("Copied to clipboard!");
        } catch (error) {
            console.error("Failed to copy:", error);
            alert("Failed to copy to clipboard");
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <div className="p-8 px-12 text-xs max-w-screen-md mx-auto">
            <h1 className="text-2xl font-bold mb-6">API Keys</h1>

            <form onSubmit={createKey} className="mb-8">
                <div className="flex gap-4">
                    <input
                        type="url"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="Enter website URL (e.g., https://example.com)"
                        className="flex-1 px-4 py-2 border rounded"
                        required
                    />
                    <button
                        type="submit"
                        disabled={creating}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                        {creating ? "Creating..." : "Create API Key"}
                    </button>
                </div>
            </form>

            {loading ? (
                <div>Loading...</div>
            ) : (
                <div className="grid gap-4">
                    {keys.map((key) => (
                        <div
                            key={key.key}
                            className="p-4 border rounded-lg bg-white"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="font-medium">
                                    {key.allowed_url}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => copyToClipboard(key.key)}
                                        className="p-2 hover:bg-gray-100 rounded-full"
                                        title="Copy API key"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        onClick={() => deleteKey(key.key)}
                                        className="p-2 hover:bg-red-100 text-red-600 rounded-full"
                                        title="Delete API key"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-500">
                                <div className="font-mono">{key.key}</div>
                                <div>Created: {formatDate(key.created_at)}</div>
                            </div>
                        </div>
                    ))}
                    {keys.length === 0 && (
                        <div className="text-center text-gray-500">
                            No API keys yet
                        </div>
                    )}
                </div>
            )}

            <div className="mt-8 space-y-8">
                <div className="p-4 bg-gray-50 rounded-lg">
                    <h2 className="text-lg font-semibold mb-2">
                        Vanilla JavaScript Integration
                    </h2>
                    <p className="mb-4">
                        Add this script to your website and initialize it with
                        your API key:
                    </p>
                    <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto">
                        {`<script src="${scriptUrl}"></script>
<script>
    window.initializeRecording('YOUR_API_KEY');
</script>`}
                    </pre>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                    <h2 className="text-lg font-semibold mb-2">
                        React.js Integration
                    </h2>
                    <p className="mb-4">
                        Create a client component and add it to your layout:
                    </p>
                    <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto">
                        {`// components/SessionRecorder.tsx
"use client";
import { useEffect } from "react";

declare global {
    interface Window {
        initializeRecording?: (apiKey: string) => void;
    }
}

export default function SessionRecorder() {
    useEffect(() => {
        const script = document.createElement("script");
        script.src = "http://localhost:3000/recording-script.js";
        script.async = true;
        document.body.appendChild(script);

        script.onload = () => {
            const apiKey = process.env.NEXT_PUBLIC_SESSION_RECORDING_API_KEY;
            if (typeof window.initializeRecording === "function" && apiKey) {
                window.initializeRecording(apiKey);
            }
        };

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    return null;
}
`}
                    </pre>

                    <p className="mt-4 text-sm text-gray-600">Make sure to:</p>
                    <ul className="mt-2 text-sm text-gray-600 list-disc pl-5 space-y-1">
                        <li>
                            Set the correct script URL in your production
                            environment
                        </li>
                        <li>
                            Add NEXT_PUBLIC_SESSION_RECORDING_API_KEY to
                            .env.local
                        </li>
                        <li>Check browser console for debug messages</li>
                        <li>
                            Verify the script is loading without CORS errors
                        </li>
                        <li>
                            Make sure your API endpoint accepts the apiKey query
                            parameter
                        </li>
                    </ul>

                    <pre className="bg-gray-900 text-white p-4 rounded-lg overflow-x-auto mt-4">
                        {`# .env.local
NEXT_PUBLIC_SESSION_RECORDING_API_KEY=your_api_key_here`}
                    </pre>
                </div>
            </div>
        </div>
    );
}

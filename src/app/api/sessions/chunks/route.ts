import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// CORS headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

// Helper function to normalize URLs (only compare hostname and port)
function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        // Only include hostname and port
        return urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : "");
    } catch (e) {
        return url;
    }
}

// Generate a deterministic hash from chunk data for deduplication
function generateChunkHash(sessionId: string, events: any[]): string {
    // Create a simple hash from the number of events and the first and last event types
    if (!events || events.length === 0) return "";

    try {
        const firstEvent = events[0].type;
        const lastEvent = events[events.length - 1].type;
        const eventCount = events.length;
        const firstTimestamp = events[0].data?.timestamp || "";

        return `${sessionId}-${eventCount}-${firstEvent}-${lastEvent}-${firstTimestamp}`;
    } catch (e) {
        console.error("Error generating chunk hash:", e);
        return Math.random().toString(36).substring(2);
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get("sessionId");

        if (!sessionId) {
            return NextResponse.json(
                { error: "Session ID is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        const { data, error } = await supabase
            .from("session_chunks")
            .select("*")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true });

        if (error) throw error;

        return NextResponse.json(data, { headers: corsHeaders });
    } catch (error) {
        console.error("Error fetching chunks:", error);
        return NextResponse.json(
            { error: "Failed to fetch chunks" },
            { status: 500, headers: corsHeaders }
        );
    }
}

export async function POST(request: Request) {
    try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) {
            return NextResponse.json(
                { error: "API key is required" },
                { status: 401, headers: corsHeaders }
            );
        }

        const { sessionId, events, url } = await request.json();

        if (!sessionId || !events || !Array.isArray(events)) {
            return NextResponse.json(
                { error: "Invalid session data format" },
                { status: 400, headers: corsHeaders }
            );
        }

        // Skip empty event arrays
        if (events.length === 0) {
            return NextResponse.json(
                { message: "No events to save" },
                { headers: corsHeaders }
            );
        }

        // Validate API key and URL
        const { data: apiKeyData, error: apiKeyError } = await supabase
            .from("api_keys")
            .select("allowed_url")
            .eq("key", apiKey)
            .single();

        if (apiKeyError || !apiKeyData) {
            return NextResponse.json(
                { error: "Invalid API key" },
                { status: 401, headers: corsHeaders }
            );
        }

        // Normalize both URLs for comparison
        const normalizedAllowedUrl = normalizeUrl(apiKeyData.allowed_url);
        const normalizedRequestUrl = normalizeUrl(url);

        console.log("Comparing URLs:", {
            allowed: normalizedAllowedUrl,
            request: normalizedRequestUrl,
        });

        if (normalizedAllowedUrl !== normalizedRequestUrl) {
            return NextResponse.json(
                { error: "URL not allowed for this API key" },
                { status: 401, headers: corsHeaders }
            );
        }

        // Check if the session exists
        const { data: sessionData, error: sessionError } = await supabase
            .from("sessions")
            .select("id")
            .eq("id", sessionId)
            .single();

        if (sessionError || !sessionData) {
            console.log("Session not found, creating it first");
            // Create the session if it doesn't exist
            const { error: createSessionError } = await supabase
                .from("sessions")
                .insert({
                    id: sessionId,
                    url,
                    created_at: new Date().toISOString(),
                });

            if (createSessionError) {
                console.error("Error creating session:", createSessionError);
                return NextResponse.json(
                    { error: "Failed to create session" },
                    { status: 500, headers: corsHeaders }
                );
            }
        }

        // Generate a hash for this chunk to detect duplicates
        const chunkHash = generateChunkHash(sessionId, events);

        // Check if we already have this exact chunk
        const { data: existingChunk } = await supabase
            .from("session_chunks")
            .select("id")
            .eq("hash", chunkHash)
            .single();

        if (existingChunk) {
            console.log("Duplicate chunk detected, skipping insertion");
            return NextResponse.json(
                { success: true, message: "Duplicate chunk skipped" },
                { headers: corsHeaders }
            );
        }

        // Insert the chunk data with the hash
        const { error } = await supabase.from("session_chunks").insert({
            session_id: sessionId,
            events: events,
            hash: chunkHash,
            created_at: new Date().toISOString(),
        });

        if (error) {
            console.error("Error saving chunk:", error);
            return NextResponse.json(
                { error: "Failed to save chunk" },
                { status: 500, headers: corsHeaders }
            );
        }

        return NextResponse.json({ success: true }, { headers: corsHeaders });
    } catch (error) {
        console.error("Error in POST /api/sessions/chunks:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500, headers: corsHeaders }
        );
    }
}

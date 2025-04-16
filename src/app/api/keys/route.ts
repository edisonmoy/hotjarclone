import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

// Generate a random API key
function generateApiKey() {
    return `hc_${crypto.randomBytes(24).toString("hex")}`;
}

// Validate URL format
function isValidUrl(url: string) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

export async function POST(request: Request) {
    try {
        const { url } = await request.json();

        if (!url) {
            return NextResponse.json(
                { error: "URL is required" },
                { status: 400 }
            );
        }

        if (!isValidUrl(url)) {
            return NextResponse.json(
                { error: "Invalid URL format" },
                { status: 400 }
            );
        }

        // Generate new API key
        const apiKey = generateApiKey();

        // Store in database
        const { error } = await supabase.from("api_keys").insert({
            key: apiKey,
            allowed_url: url,
            created_at: new Date().toISOString(),
        });

        if (error) {
            console.error("Error creating API key:", error);
            return NextResponse.json(
                { error: "Failed to create API key" },
                { status: 500 }
            );
        }

        return NextResponse.json({ apiKey });
    } catch (error) {
        console.error("Error in POST /api/keys:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    try {
        const { data: keys, error } = await supabase
            .from("api_keys")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error fetching API keys:", error);
            return NextResponse.json(
                { error: "Failed to fetch API keys" },
                { status: 500 }
            );
        }

        return NextResponse.json(keys);
    } catch (error) {
        console.error("Error in GET /api/keys:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get("key");

        if (!key) {
            return NextResponse.json(
                { error: "API key is required" },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from("api_keys")
            .delete()
            .eq("key", key);

        if (error) {
            console.error("Error deleting API key:", error);
            return NextResponse.json(
                { error: "Failed to delete API key" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error in DELETE /api/keys:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

import { NextResponse, NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { withRateLimit, globalRateLimiter } from "@/lib/rate-limit";

// Define rate limit constants - different limits for different operations
const GET_RATE_LIMIT = 120; // 120 requests
const GET_RATE_LIMIT_WINDOW = 60 * 1000; // per minute (60 seconds)

const POST_RATE_LIMIT = 100; // 100 requests
const POST_RATE_LIMIT_WINDOW = 60 * 1000; // per minute

const DELETE_RATE_LIMIT = 20; // 20 requests
const DELETE_RATE_LIMIT_WINDOW = 60 * 1000; // per minute

// CORS headers - base headers to extend with proper origin
const baseCorsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

// Function to get the allowed domains for origin checking
function getAllowedDomains(host: string) {
    return [
        host, // Current domain the app is running on
        "localhost:3000",
        "localhost:4000",
        // Add your production domain here
    ];
}

// Function to create CORS headers with proper origin for internal app routes (GET, DELETE)
function getCorsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get("origin") || "";
    const host = request.headers.get("host") || "";
    const allowedDomains = getAllowedDomains(host);

    // Check if origin is allowed
    const isAllowedOrigin =
        origin && allowedDomains.some((domain) => origin.includes(domain));

    // Create headers with proper origin
    const headers: Record<string, string> = { ...baseCorsHeaders };

    // Set the Access-Control-Allow-Origin header based on the request origin
    if (isAllowedOrigin) {
        headers["Access-Control-Allow-Origin"] = origin;
    } else if (host) {
        headers["Access-Control-Allow-Origin"] = `https://${host}`;
    } else {
        // Fallback - but this is more restrictive than the previous "*"
        headers["Access-Control-Allow-Origin"] = "null";
    }

    return headers;
}

// Function to create open CORS headers for POST requests from recording scripts
function getOpenCorsHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...baseCorsHeaders };

    // Allow any origin for POST requests from customer websites
    headers["Access-Control-Allow-Origin"] = "*";

    return headers;
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: Request) {
    // Check the requested method to determine appropriate CORS response
    const accessControlRequestMethod =
        request.headers.get("access-control-request-method") || "";

    // If it's a POST request, return open CORS headers
    if (accessControlRequestMethod === "POST") {
        return NextResponse.json(
            {},
            {
                headers: getOpenCorsHeaders(),
            }
        );
    }

    // For GET and DELETE requests, use restricted CORS
    return NextResponse.json(
        {},
        {
            headers: getCorsHeaders(request),
        }
    );
}

// Function to check if request is from an allowed domain
function isRequestFromAllowedDomain(request: Request): boolean {
    const referer = request.headers.get("referer") || "";
    const origin = request.headers.get("origin") || "";
    const host = request.headers.get("host") || "";
    const allowedDomains = getAllowedDomains(host);

    // Make sure to return a boolean
    return Boolean(
        (referer &&
            allowedDomains.some((domain) => referer.includes(domain))) ||
            (origin && allowedDomains.some((domain) => origin.includes(domain)))
    );
}

// Original handler functions
async function getSessionsHandler(request: Request) {
    try {
        // Validate that the request is coming from an allowed origin for sensitive data
        if (!isRequestFromAllowedDomain(request)) {
            return NextResponse.json(
                { error: "Unauthorized: Access denied" },
                { status: 403, headers: getCorsHeaders(request) }
            );
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (id) {
            // If ID is provided, fetch single session
            const { data, error } = await supabase
                .from("sessions")
                .select("*")
                .eq("id", id)
                .single();

            if (error) throw error;
            return NextResponse.json(data, {
                headers: getCorsHeaders(request),
            });
        } else {
            // Otherwise, fetch all sessions
            const { data, error } = await supabase
                .from("sessions")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return NextResponse.json(data, {
                headers: getCorsHeaders(request),
            });
        }
    } catch (error) {
        console.error("Error fetching sessions:", error);
        return NextResponse.json(
            { error: "Failed to fetch sessions" },
            { status: 500, headers: getCorsHeaders(request) }
        );
    }
}

async function createSessionHandler(request: Request) {
    try {
        // First check API key requirement
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey) {
            return NextResponse.json(
                { error: "API key is required" },
                { status: 401, headers: getOpenCorsHeaders() }
            );
        }

        // We no longer check for allowed domains on POST requests
        // POST requests must be allowed from any customer website where the script is installed
        // Security is enforced through API key validation instead

        const body = await request.json();
        const {
            id,
            url,
            viewport_size,
            user_agent,
            screen_resolution,
            referrer,
            start_time,
            end_time,
        } = body;

        if (!id || !url) {
            return NextResponse.json(
                { error: "Session ID and URL are required" },
                { status: 400, headers: getOpenCorsHeaders() }
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
                { status: 401, headers: getOpenCorsHeaders() }
            );
        }

        // Only check hostname for URL matching now
        const allowedUrl = new URL(apiKeyData.allowed_url).hostname;
        const requestUrl = new URL(url).hostname;
        if (allowedUrl !== requestUrl) {
            return NextResponse.json(
                { error: "URL not allowed for this API key" },
                { status: 401, headers: getOpenCorsHeaders() }
            );
        }

        // Check if session already exists
        const { data: existingSession } = await supabase
            .from("sessions")
            .select("id, url, viewport_size, created_at")
            .eq("id", id)
            .single();

        // If session exists, update it; otherwise create it
        let operation;
        if (existingSession) {
            console.log(`Session ${id} already exists, updating...`);
            // Only update end_time to avoid overwriting important data
            operation = supabase
                .from("sessions")
                .update({
                    end_time,
                    // Only update url if it's not already set
                    ...(existingSession.url ? {} : { url }),
                    // Only update viewport_size if it's not already set
                    ...(existingSession.viewport_size ? {} : { viewport_size }),
                })
                .eq("id", id);
        } else {
            console.log(`Creating new session ${id}...`);
            // Insert a new session with all fields
            operation = supabase.from("sessions").insert({
                id,
                url,
                viewport_size,
                user_agent,
                screen_resolution,
                referrer,
                start_time,
                end_time,
                created_at: new Date().toISOString(),
            });
        }

        const { data, error } = await operation.select().single();

        if (error) {
            console.error("Error saving session:", error);
            throw error;
        }

        return NextResponse.json(data, { headers: getOpenCorsHeaders() });
    } catch (error) {
        console.error("Error creating session:", error);
        return NextResponse.json(
            { error: "Failed to create session" },
            { status: 500, headers: getOpenCorsHeaders() }
        );
    }
}

async function deleteSessionHandler(request: Request) {
    try {
        // Check if request is from an allowed domain
        if (!isRequestFromAllowedDomain(request)) {
            return NextResponse.json(
                {
                    error: "Unauthorized: Only the HotClone app can delete sessions",
                },
                { status: 403, headers: getCorsHeaders(request) }
            );
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Session ID is required" },
                { status: 400, headers: getCorsHeaders(request) }
            );
        }

        const { error } = await supabase.from("sessions").delete().eq("id", id);

        if (error) throw error;

        return NextResponse.json(
            { success: true },
            { headers: getCorsHeaders(request) }
        );
    } catch (error) {
        console.error("Error deleting session:", error);
        return NextResponse.json(
            { error: "Failed to delete session" },
            { status: 500, headers: getCorsHeaders(request) }
        );
    }
}

// Create a custom rate limiter wrapper for POST requests that uses open CORS
function withOpenCorsRateLimit(options: {
    limit: number;
    windowMs: number;
    identityKey?: (req: NextRequest) => string;
    errorMessage?: string;
    handler: (request: NextRequest) => Promise<NextResponse> | NextResponse;
}) {
    const {
        limit,
        windowMs,
        handler,
        errorMessage = "Too many requests, please try again later",
    } = options;

    return async function rateLimitedHandler(request: NextRequest) {
        const result = globalRateLimiter.rateLimit({
            request,
            limit,
            windowMs,
            identityKey: options.identityKey,
        });

        // Set rate limit headers
        const headers = new Headers(getOpenCorsHeaders());
        headers.set("X-RateLimit-Limit", String(result.limit));
        headers.set("X-RateLimit-Remaining", String(result.remaining));
        headers.set("X-RateLimit-Reset", String(result.reset));

        // If rate limited, return 429 Too Many Requests with open CORS headers
        if (!result.success) {
            return NextResponse.json(
                { error: errorMessage },
                {
                    status: 429,
                    headers: {
                        ...Object.fromEntries(headers.entries()),
                        "Retry-After": Math.ceil(
                            (result.reset - Date.now()) / 1000
                        ).toString(),
                    },
                }
            );
        }

        // Otherwise, call the handler
        const response = await handler(request);

        // Add rate limit headers to the response
        Object.entries(Object.fromEntries(headers.entries())).forEach(
            ([key, value]) => {
                response.headers.set(key, value);
            }
        );

        return response;
    };
}

// Apply rate limiting to endpoints
export const GET = withRateLimit({
    limit: GET_RATE_LIMIT,
    windowMs: GET_RATE_LIMIT_WINDOW,
    errorMessage:
        "Rate limit exceeded for session retrieval. Please try again later.",
    handler: getSessionsHandler,
});

// Use custom rate limiter for POST that returns open CORS headers
export const POST = withOpenCorsRateLimit({
    limit: POST_RATE_LIMIT,
    windowMs: POST_RATE_LIMIT_WINDOW,
    errorMessage:
        "Rate limit exceeded for session creation. Please try again later.",
    handler: createSessionHandler,
    // Custom identity function using API key if available
    identityKey: (req) => {
        // Use API key as the rate limit identifier if present, otherwise fall back to IP
        const apiKey = req.headers.get("x-api-key");
        if (apiKey) return `apikey:${apiKey}`;

        // Safe access to IP from headers
        return (
            req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
            "unknown-ip"
        );
    },
});

export const DELETE = withRateLimit({
    limit: DELETE_RATE_LIMIT,
    windowMs: DELETE_RATE_LIMIT_WINDOW,
    errorMessage:
        "Rate limit exceeded for session deletion. Please try again later.",
    handler: deleteSessionHandler,
});

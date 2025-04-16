import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";

// Define rate limit constants
const RATE_LIMIT = 60; // 60 requests
const RATE_LIMIT_WINDOW = 60 * 1000; // per minute (60 seconds)

// This route handles all asset types through the proxy
async function proxyHandler(request: Request) {
    try {
        // Check for the presence of a referer or origin header to verify the request is from our app
        const referer = request.headers.get("referer") || "";
        const origin = request.headers.get("origin") || "";

        // Get host from request
        const host = request.headers.get("host") || "";

        // Allowlist of domains that can use the proxy (app itself and local development)
        const allowedDomains = [
            host, // Current domain the app is running on
            "localhost:3000",
            "localhost:4000",
            // Add your production domain here
        ];

        // Check if request is from an allowed domain
        const isAllowedDomain =
            (referer &&
                allowedDomains.some((domain) => referer.includes(domain))) ||
            (origin &&
                allowedDomains.some((domain) => origin.includes(domain)));

        if (!isAllowedDomain) {
            return NextResponse.json(
                { error: "Unauthorized: Access denied" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const url = searchParams.get("url");

        if (!url) {
            return NextResponse.json(
                { error: "URL parameter is required" },
                { status: 400 }
            );
        }

        // Basic URL validation to prevent obvious SSRF attempts
        try {
            new URL(url);
        } catch {
            return NextResponse.json(
                { error: "Invalid URL format" },
                { status: 400 }
            );
        }

        // Directly fetch the requested resource
        const response = await fetch(url, {
            headers: {
                // Send a more realistic user agent to avoid being blocked
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                Accept: "*/*",
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch resource: ${response.statusText}` },
                { status: response.status }
            );
        }

        // Get content type to handle different asset types
        const contentType = response.headers.get("content-type") || "";
        const responseBuffer = await response.arrayBuffer();

        // Create response headers
        const headers = new Headers();

        // Copy original headers
        response.headers.forEach((value, key) => {
            // Skip headers that might cause issues
            if (
                !["content-encoding", "content-length", "connection"].includes(
                    key.toLowerCase()
                )
            ) {
                headers.set(key, value);
            }
        });

        // Set CORS headers to allow only the specific origin
        // instead of wildcard "*"
        if (
            origin &&
            allowedDomains.some((domain) => origin.includes(domain))
        ) {
            headers.set("Access-Control-Allow-Origin", origin);
        } else {
            // Fallback to the current host
            headers.set("Access-Control-Allow-Origin", `https://${host}`);
        }

        // Add security headers
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("X-Frame-Options", "SAMEORIGIN");
        headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

        // If this is HTML content, we need to rewrite links
        if (contentType.includes("text/html")) {
            // First, just try to pass through the HTML unchanged
            // If we need to modify it later, we can add that back
            return new NextResponse(responseBuffer, {
                headers,
                status: response.status,
            });
        }

        // For all other content types (images, CSS, JS, etc.), pass them through directly
        return new NextResponse(responseBuffer, {
            headers,
            status: response.status,
        });
    } catch (error) {
        console.error("Proxy error:", error);
        return NextResponse.json(
            { error: "Failed to proxy content" },
            { status: 500 }
        );
    }
}

// Apply rate limiting to GET endpoint
export const GET = withRateLimit({
    limit: RATE_LIMIT,
    windowMs: RATE_LIMIT_WINDOW,
    errorMessage:
        "Rate limit exceeded. Too many proxy requests from this IP address.",
    handler: proxyHandler,
});

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(request: Request) {
    const origin = request.headers.get("origin") || "";
    const host = request.headers.get("host") || "";

    // Same allowlist as in GET handler
    const allowedDomains = [
        host,
        "localhost:3000",
        "localhost:4000",
        // Add your production domain here
    ];

    // Check if origin is allowed
    const isAllowedOrigin =
        origin && allowedDomains.some((domain) => origin.includes(domain));

    // Headers for CORS preflight response
    const headers = new Headers({
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        "Access-Control-Max-Age": "86400", // 24 hours
    });

    // Set the Access-Control-Allow-Origin header based on the request origin
    if (isAllowedOrigin) {
        headers.set("Access-Control-Allow-Origin", origin);
    } else if (host) {
        headers.set("Access-Control-Allow-Origin", `https://${host}`);
    }

    return new NextResponse(null, {
        status: 204,
        headers,
    });
}

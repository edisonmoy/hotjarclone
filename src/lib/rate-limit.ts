import { NextRequest, NextResponse } from "next/server";

// Simple in-memory store for rate limiting
// In production, this should be replaced with Redis or similar for distributed deployments
interface RateLimitStore {
    [ip: string]: {
        count: number;
        resetTime: number;
    };
}

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;

class RateLimiter {
    private store: RateLimitStore = {};
    private interval: NodeJS.Timeout;

    constructor() {
        // Set up periodic cleanup to prevent memory leaks
        this.interval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    }

    private cleanup() {
        const now = Date.now();
        for (const ip in this.store) {
            if (this.store[ip].resetTime < now) {
                delete this.store[ip];
            }
        }
    }

    public rateLimit(options: {
        request: NextRequest;
        limit: number;
        windowMs: number;
        identityKey?: (req: NextRequest) => string;
    }): { success: boolean; limit: number; remaining: number; reset: number } {
        const { request, limit, windowMs } = options;

        // Get identity - default to IP, but can be customized
        const getIdentity =
            options.identityKey ||
            ((req: NextRequest) => {
                // Get client IP, considering possible proxy headers
                return (
                    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
                    request.ip ||
                    "unknown"
                );
            });

        const key = getIdentity(request);
        const now = Date.now();

        // Initialize or reset if window has passed
        if (!this.store[key] || this.store[key].resetTime < now) {
            this.store[key] = {
                count: 0,
                resetTime: now + windowMs,
            };
        }

        // Increment counter
        this.store[key].count++;

        // Check if limit is exceeded
        const isRateLimited = this.store[key].count > limit;

        return {
            success: !isRateLimited,
            limit,
            remaining: Math.max(0, limit - this.store[key].count),
            reset: this.store[key].resetTime,
        };
    }

    // Destroy the interval on app shutdown
    public shutdown() {
        clearInterval(this.interval);
    }
}

// Create a global instance
export const globalRateLimiter = new RateLimiter();

// Higher-order function to apply rate limiting to a Next.js API route
export function withRateLimit(options: {
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
        const headers = new Headers();
        headers.set("X-RateLimit-Limit", String(result.limit));
        headers.set("X-RateLimit-Remaining", String(result.remaining));
        headers.set("X-RateLimit-Reset", String(result.reset));

        // If rate limited, return 429 Too Many Requests
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

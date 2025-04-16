"use client";

import { useRef, useEffect } from "react";
import { CanvasElement } from "./types";

interface DomRendererProps {
    html: string;
    canvasSnapshots: CanvasElement[];
    sourceUrl?: string;
}

const DomRenderer = ({
    html,
    canvasSnapshots,
    sourceUrl,
}: DomRendererProps) => {
    const replayContentRef = useRef<HTMLDivElement>(null);
    const shadowRootRef = useRef<ShadowRoot | null>(null);

    const getHostnameFromSourceUrl = (url?: string): string | null => {
        console.log(url);
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            return `${urlObj.protocol}//${urlObj.host}`;
        } catch (e) {
            console.error("Invalid sourceUrl:", e);
            return null;
        }
    };

    const sanitizeHtml = (html: string): string => {
        if (!html) return "";
        try {
            // Basic sanitization to prevent XSS
            const sanitized = html
                .replace(
                    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                    ""
                )
                .replace(/on\w+="[^"]*"/gi, "")
                .replace(/on\w+='[^']*'/gi, "");
            return sanitized;
        } catch (error) {
            console.error("Error sanitizing HTML:", error);
            return "";
        }
    };

    const fixRelativeImagePaths = (
        html: string,
        hostname: string | null
    ): string => {
        if (!hostname) return html;

        // Create a temporary div to parse the HTML
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;

        // Find all image tags
        const imgTags = tempDiv.querySelectorAll("img");
        imgTags.forEach((img) => {
            const src = img.getAttribute("src");
            const srcset = img.getAttribute("srcset");
            if (!src) return;

            // Handle Next.js image URLs
            if (src.includes("_next/image") && src.includes("url=")) {
                try {
                    // Extract the original image path from the URL parameter
                    const urlParam = new URLSearchParams(src.split("?")[1]).get(
                        "url"
                    );
                    if (urlParam) {
                        // Decode the URL parameter which contains the original image path
                        const originalPath = decodeURIComponent(urlParam);
                        // Create the full URL with hostname
                        const newSrc = originalPath.startsWith("/")
                            ? `${hostname}${originalPath}`
                            : `${hostname}/${originalPath}`;
                        img.setAttribute("src", newSrc);

                        // Also fix srcset if it exists
                        if (srcset) {
                            const newSrcSet = srcset
                                .split(", ")
                                .map((part) => {
                                    if (
                                        part.includes("_next/image") &&
                                        part.includes("url=")
                                    ) {
                                        const [url, descriptor] =
                                            part.split(" ");
                                        const urlParams = new URLSearchParams(
                                            url.split("?")[1]
                                        );
                                        const imgUrl = urlParams.get("url");
                                        if (imgUrl) {
                                            const originalImgPath =
                                                decodeURIComponent(imgUrl);
                                            const newImgSrc =
                                                originalImgPath.startsWith("/")
                                                    ? `${hostname}${originalImgPath}`
                                                    : `${hostname}/${originalImgPath}`;
                                            return `${newImgSrc} ${descriptor}`;
                                        }
                                    }
                                    return part;
                                })
                                .join(", ");

                            img.setAttribute("srcset", newSrcSet);
                        }

                        // Ensure data-nimg is removed to prevent Next.js interference
                        img.removeAttribute("data-nimg");
                    }
                } catch (e) {
                    console.error("Failed to parse Next.js image URL:", e);
                }
            }
            // Handle regular relative URLs
            else if (
                !src.startsWith("http://") &&
                !src.startsWith("https://") &&
                !src.startsWith("data:") &&
                !src.startsWith("//")
            ) {
                // This is a relative path, prepend the hostname
                const newSrc = src.startsWith("/")
                    ? `${hostname}${src}`
                    : `${hostname}/${src}`;
                console.log(`Replacing relative path: ${src} -> ${newSrc}`);
                img.setAttribute("src", newSrc);
            }
        });

        return tempDiv.innerHTML;
    };

    // Fix relative paths in CSS links and extract embedded styles
    const processStyles = (
        html: string,
        hostname: string | null
    ): { processedHtml: string; extractedCSS: string } => {
        if (!html) return { processedHtml: "", extractedCSS: "" };

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = html;

        let extractedCSS = "";

        // Process <link> tags for external stylesheets
        const linkTags = tempDiv.querySelectorAll('link[rel="stylesheet"]');
        linkTags.forEach((link) => {
            const href = link.getAttribute("href");
            if (href && hostname && !href.startsWith("http")) {
                // Fix relative paths in external stylesheets
                const fixedHref = href.startsWith("/")
                    ? `${hostname}${href}`
                    : `${hostname}/${href}`;
                link.setAttribute("href", fixedHref);

                // Instead of adding to document.head, keep links in the container
                // This ensures styles only apply to the session visualizer
            }
        });

        // Extract <style> tags content
        const styleTags = tempDiv.querySelectorAll("style");
        styleTags.forEach((style) => {
            extractedCSS += style.textContent || "";
        });

        return {
            processedHtml: tempDiv.innerHTML,
            extractedCSS,
        };
    };

    // Apply DOM content to the container
    const applyDomToReplayContent = (html: string) => {
        if (replayContentRef.current) {
            try {
                // Create shadow root if it doesn't exist
                if (!shadowRootRef.current && replayContentRef.current) {
                    shadowRootRef.current =
                        replayContentRef.current.attachShadow({ mode: "open" });
                }

                const shadowRoot = shadowRootRef.current;
                if (!shadowRoot) return;

                if (!html) {
                    console.warn(
                        "Empty HTML provided to applyDomToReplayContent"
                    );
                    shadowRoot.innerHTML = `
                        <div style="padding: 20px; text-align: center;">
                            <p style="color: #666;">No DOM content available for reconstruction</p>
                        </div>
                    `;
                    return;
                }

                console.log(`Applying DOM content of length: ${html.length}`);
                // Log first 100 chars to debug content
                console.log(
                    `HTML content starts with: "${html.substring(0, 100)}..."`
                );

                // Check for just HTML document start/end tags with nothing in between
                if (
                    html.match(/^<html[^>]*><\/html>$/i) ||
                    html.match(
                        /^<html[^>]*><head[^>]*><\/head><body[^>]*><\/body><\/html>$/i
                    )
                ) {
                    console.warn(
                        "HTML content appears to be empty (just tags)"
                    );
                    shadowRoot.innerHTML = `
                        <div style="padding: 20px; text-align: center;">
                            <p style="color: #e53e3e;">HTML content appears to be empty (just tags)</p>
                        </div>
                    `;
                    return;
                }

                // Apply sanitized HTML
                const sanitized = sanitizeHtml(html);

                if (sanitized.length < 50) {
                    console.warn(
                        `Sanitized HTML is suspiciously short: "${sanitized}"`
                    );
                    shadowRoot.innerHTML = `
                        <div style="padding: 20px; text-align: center;">
                            <p style="color: #e53e3e;">Invalid or corrupted DOM content (${sanitized.length} chars)</p>
                            <pre style="margin-top: 10px; font-size: 10px; color: #666; text-align: left; max-height: 100px; overflow: auto;">${sanitized}</pre>
                        </div>
                    `;
                    return;
                }

                // Fix relative image paths
                const hostname = getHostnameFromSourceUrl(sourceUrl);
                const processedHtml = fixRelativeImagePaths(
                    sanitized,
                    hostname
                );

                // Process and extract CSS
                const { processedHtml: htmlWithStyles, extractedCSS } =
                    processStyles(processedHtml, hostname);

                // Try to apply the HTML content
                try {
                    // Create a temporary div to test if the HTML can be parsed correctly
                    const tempDiv = document.createElement("div");
                    tempDiv.innerHTML = htmlWithStyles;

                    if (tempDiv.children.length === 0) {
                        console.warn(
                            "HTML content could not be parsed correctly"
                        );
                        // Show raw HTML content for debugging
                        shadowRoot.innerHTML = `
                            <div style="padding: 20px; text-align: center;">
                                <p style="color: #e53e3e;">HTML content could not be parsed correctly</p>
                                <div style="max-height: 300px; overflow: auto; text-align: left; margin-top: 20px; padding: 10px; border: 1px solid #ddd;">
                                    <pre style="white-space: pre-wrap; font-size: 12px;">${htmlWithStyles.substring(
                                        0,
                                        500
                                    )}...</pre>
                                </div>
                            </div>
                        `;
                        return;
                    }

                    // If parsing succeeded, apply to the actual container in shadow DOM
                    // Create a wrapper for the content
                    const contentWrapper = document.createElement("div");
                    contentWrapper.className = "w-full h-full";
                    contentWrapper.innerHTML = htmlWithStyles;

                    // Clear the shadow root
                    shadowRoot.innerHTML = "";

                    // Apply extracted CSS if any
                    if (extractedCSS) {
                        const styleEl = document.createElement("style");
                        styleEl.textContent = extractedCSS;
                        shadowRoot.appendChild(styleEl);
                    }

                    // Add the content
                    shadowRoot.appendChild(contentWrapper);

                    // Check if anything was actually rendered
                    if (contentWrapper.children.length === 0) {
                        console.warn(
                            "No elements were rendered after setting innerHTML"
                        );

                        // Fall back to a simpler rendering approach
                        const fallbackContent = document.createElement("div");
                        fallbackContent.innerHTML = `
                            <div style="padding: 20px;">
                                <h2>Content Preview (Fallback Mode)</h2>
                                <p>The session recording contains HTML content but it could not be properly rendered.</p>
                                <div style="border: 1px solid #ddd; padding: 10px; margin-top: 10px; max-height: 400px; overflow: auto;">
                                    <pre style="white-space: pre-wrap; font-size: 12px;">${htmlWithStyles.substring(
                                        0,
                                        1000
                                    )}${
                            htmlWithStyles.length > 1000 ? "...(truncated)" : ""
                        }</pre>
                                </div>
                            </div>
                        `;
                        shadowRoot.innerHTML = "";
                        shadowRoot.appendChild(fallbackContent);
                    } else {
                        // Process the DOM after setting it successfully
                        const scripts =
                            contentWrapper.querySelectorAll("script");
                        scripts.forEach((script) => script.remove());

                        // Disable links
                        const links = contentWrapper.querySelectorAll("a");
                        links.forEach((link) => {
                            link.style.pointerEvents = "none";
                            link.addEventListener("click", (e) =>
                                e.preventDefault()
                            );
                        });

                        // Disable forms
                        const forms = contentWrapper.querySelectorAll("form");
                        forms.forEach((form) => {
                            form.addEventListener("submit", (e) =>
                                e.preventDefault()
                            );
                        });

                        console.log(
                            "DOM applied successfully with child elements:",
                            contentWrapper.children.length
                        );
                    }
                } catch (innerError: unknown) {
                    console.error("Error applying HTML to DOM:", innerError);
                    // Provide an error message with details
                    const errorMsg =
                        innerError instanceof Error
                            ? innerError.message
                            : "Unknown error";
                    shadowRoot.innerHTML = `
                        <div style="padding: 20px; color: #e53e3e;">
                            <h3>Error Rendering Content</h3>
                            <p>There was an error applying the DOM snapshot: ${errorMsg}</p>
                        </div>
                    `;
                }
            } catch (error) {
                console.error("Error in applyDomToReplayContent:", error);
                if (shadowRootRef.current) {
                    shadowRootRef.current.innerHTML =
                        '<div style="padding: 16px;">Error rendering content</div>';
                }
            }
        }
    };

    // Apply DOM content when it changes
    useEffect(() => {
        if (html && replayContentRef.current) {
            applyDomToReplayContent(html);

            // Process canvas elements if needed
            if (shadowRootRef.current && canvasSnapshots.length > 0) {
                const canvasElements =
                    shadowRootRef.current.querySelectorAll("canvas");
                canvasElements.forEach((canvas) => {
                    const domId = canvas.getAttribute("data-hotclone-id");
                    if (!domId) return;

                    const snapshot = canvasSnapshots.find(
                        (s) => s.domId === domId || s.id === domId
                    );
                    if (snapshot && snapshot.dataUrl) {
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                            const img = new Image();
                            img.onload = () => {
                                if (snapshot.width)
                                    canvas.width = snapshot.width;
                                if (snapshot.height)
                                    canvas.height = snapshot.height;
                                ctx.clearRect(
                                    0,
                                    0,
                                    canvas.width,
                                    canvas.height
                                );
                                ctx.drawImage(img, 0, 0);
                            };
                            img.src = snapshot.dataUrl;
                        }
                    }
                });
            }
        }
    }, [html, canvasSnapshots, sourceUrl]);

    return (
        <div
            ref={replayContentRef}
            className="w-full h-full"
            style={{
                pointerEvents: "none",
            }}
        >
            {!html && !shadowRootRef.current && (
                <div className="flex items-center justify-center h-full bg-gray-100">
                    <p className="text-gray-500">Loading content...</p>
                </div>
            )}
        </div>
    );
};

export default DomRenderer;

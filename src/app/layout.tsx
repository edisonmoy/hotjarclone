import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "HotJarClone - Session Recording",
    description: "A Hotjar clone for session recording and playback",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="icon.ico" sizes="any" />
            </head>
            <body className={inter.className}>{children}</body>
        </html>
    );
}

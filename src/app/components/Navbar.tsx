import Link from "next/link";
import { usePathname } from "next/navigation";
import { Key, Video } from "lucide-react";

export default function Navbar() {
    const pathname = usePathname();

    const isActive = (path: string) => {
        return pathname.startsWith(path);
    };

    return (
        <nav className="bg-white shadow-sm">
            <div className="h-full flex flex-col">
                <div className="p-4 border-b">
                    <h1 className="text-xl font-bold">HotClone</h1>
                </div>
                <div className="flex-1 flex flex-col space-y-1 p-4">
                    <Link
                        href="/sessions"
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                            isActive("/sessions")
                                ? "text-gray-900 bg-gray-100"
                                : "text-gray-500 hover:bg-gray-50"
                        }`}
                    >
                        <Video className="h-5 w-5 mr-3" />
                        Sessions
                    </Link>
                    <Link
                        href="/keys"
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                            isActive("/keys")
                                ? "text-gray-900 bg-gray-100"
                                : "text-gray-500 hover:bg-gray-50"
                        }`}
                    >
                        <Key className="h-5 w-5 mr-3" />
                        API Keys
                    </Link>
                </div>
            </div>
        </nav>
    );
}

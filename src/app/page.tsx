import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Session Analytics Dashboard",
    description: "Track and analyze user sessions in real-time",
};

export default function Home() {
    return (
        <main className="min-h-screen p-8">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold mb-8">
                    Session Analytics Dashboard
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Active Sessions Card */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold mb-4">
                            Active Sessions
                        </h2>
                        <p className="text-3xl font-bold">0</p>
                    </div>

                    {/* Total Recordings Card */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold mb-4">
                            Total Recordings
                        </h2>
                        <p className="text-3xl font-bold">0</p>
                    </div>

                    {/* Average Session Duration Card */}
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold mb-4">
                            Avg. Session Duration
                        </h2>
                        <p className="text-3xl font-bold">0m</p>
                    </div>
                </div>

                {/* Recent Sessions Table */}
                <div className="mt-8 bg-white rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        Recent Sessions
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-4 px-6">
                                        Session ID
                                    </th>
                                    <th className="text-left py-4 px-6">
                                        Duration
                                    </th>
                                    <th className="text-left py-4 px-6">
                                        Page Views
                                    </th>
                                    <th className="text-left py-4 px-6">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b">
                                    <td className="py-4 px-6">
                                        No sessions recorded yet
                                    </td>
                                    <td className="py-4 px-6">-</td>
                                    <td className="py-4 px-6">-</td>
                                    <td className="py-4 px-6">-</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
}

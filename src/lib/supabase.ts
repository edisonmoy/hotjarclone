import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type Session = {
    id: string;
    events: any[];
    startTime: number;
    endTime: number;
    url: string;
    viewportSize: string;
    createdAt: string;
};

export type SessionChunk = {
    id: string;
    sessionId: string;
    events: any[];
    startTime: number;
    endTime: number;
    createdAt: string;
};

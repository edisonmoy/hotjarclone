interface SessionEvent {
    type: string;
    timestamp: number;
    data: any;
}

class SessionRecorder {
    private events: SessionEvent[] = [];
    private startTime: number;
    private isRecording: boolean = false;

    constructor() {
        this.startTime = Date.now();
    }

    startRecording() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.startTime = Date.now();
        this.setupEventListeners();
    }

    stopRecording() {
        this.isRecording = false;
        this.removeEventListeners();
        return this.getSessionData();
    }

    private setupEventListeners() {
        // Mouse movement tracking
        document.addEventListener("mousemove", this.handleMouseMove);

        // Click tracking
        document.addEventListener("click", this.handleClick);

        // Scroll tracking
        document.addEventListener("scroll", this.handleScroll);

        // Input tracking
        document.addEventListener("input", this.handleInput);

        // Page visibility tracking
        document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
    }

    private removeEventListeners() {
        document.removeEventListener("mousemove", this.handleMouseMove);
        document.removeEventListener("click", this.handleClick);
        document.removeEventListener("scroll", this.handleScroll);
        document.removeEventListener("input", this.handleInput);
        document.removeEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
    }

    private handleMouseMove = (event: MouseEvent) => {
        this.recordEvent("mousemove", {
            x: event.clientX,
            y: event.clientY,
            pageX: event.pageX,
            pageY: event.pageY,
        });
    };

    private handleClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        this.recordEvent("click", {
            x: event.clientX,
            y: event.clientY,
            target: {
                tagName: target.tagName,
                id: target.id,
                className: target.className,
                text: target.textContent?.slice(0, 100),
            },
        });
    };

    private handleScroll = () => {
        this.recordEvent("scroll", {
            x: window.scrollX,
            y: window.scrollY,
        });
    };

    private handleInput = (event: Event) => {
        const target = event.target as HTMLInputElement;
        this.recordEvent("input", {
            target: {
                tagName: target.tagName,
                id: target.id,
                className: target.className,
                value: target.value,
            },
        });
    };

    private handleVisibilityChange = () => {
        this.recordEvent("visibilitychange", {
            visibility: document.visibilityState,
        });
    };

    private recordEvent(type: string, data: any) {
        if (!this.isRecording) return;

        this.events.push({
            type,
            timestamp: Date.now() - this.startTime,
            data,
        });
    }

    private getSessionData() {
        return {
            duration: Date.now() - this.startTime,
            events: this.events,
            startTime: this.startTime,
            endTime: Date.now(),
        };
    }
}

export const sessionRecorder = new SessionRecorder();

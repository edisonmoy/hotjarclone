export interface CanvasElement {
    id: string;
    className: string;
    xpath: string;
    domId?: string;
    dataUrl: string | null;
    width?: number;
    height?: number;
    position?: {
        left: number;
        top: number;
    };
    type: string;
    src?: string;
    x: number;
    y: number;
}

export interface DomElement {
    xpath: string;
    domId: string;
    tagName?: string;
}

export interface DomState {
    elements?: DomElement[];
    canvasElements?: CanvasElement[];
    formElements?: Array<{
        id: string;
        xpath: string;
        domId?: string;
        value: string;
        type?: string;
    }>;
}

export interface EventData {
    url?: string;
    timestamp?: string;
    viewportSize?: string;
    userAgent?: string;
    screenResolution?: string;
    type?: string;
    x?: number;
    y?: number;
    pageX?: number;
    pageY?: number;
    canvasElements?: Array<CanvasElement>;
    formElements?: Array<{
        id: string;
        xpath: string;
        domId?: string;
        value: string;
        type?: string;
    }>;
    initialDomState?: DomState;
    changes?: {
        attributeChanges?: Array<{
            domId?: string;
            xpath?: string;
            attributeName: string;
            newValue: string | null;
        }>;
        textChanges?: Array<{
            domId?: string;
            xpath?: string;
            newValue: string;
        }>;
    };
    dynamicContainers?: Array<{
        id: string;
        className: string;
        xpath: string;
        html: string;
        position?: {
            left: number;
            top: number;
            width: number;
            height: number;
        };
    }>;
    target?: {
        tagName: string;
        id: string;
        className: string;
        text?: string;
        value?: string;
        xpath?: string;
        domId?: string;
    };
    relativeTime?: number;
    html?: string;
    doctype?: string;
}

export interface Event {
    id: string;
    type: string;
    timestamp: number | string;
    data: EventData;
}

export interface NormalizedEvent extends Event {
    timestamp: number;
}

export interface Session {
    id: string;
    created_at: string;
    url: string;
    user_agent: string;
    screen_width: number;
    screen_height: number;
}

export interface SessionChunk {
    id: string;
    session_id: string;
    events: Event[];
    created_at: string;
}

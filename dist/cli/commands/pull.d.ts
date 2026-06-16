export interface PullOptions {
    model?: string;
    top?: number;
    task?: string;
    json?: boolean;
    offline?: boolean;
    verbose?: boolean;
    gpu?: string;
    ram?: number;
    vram?: number;
}
export declare function pullCommand(options: PullOptions): Promise<void>;
//# sourceMappingURL=pull.d.ts.map
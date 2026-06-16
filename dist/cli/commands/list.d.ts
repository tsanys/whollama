export interface ListOptions {
    task?: string;
    all?: boolean;
    json?: boolean;
    offline?: boolean;
    verbose?: boolean;
    gpu?: string;
    ram?: number;
    vram?: number;
}
export declare function listCommand(options: ListOptions): Promise<void>;
//# sourceMappingURL=list.d.ts.map
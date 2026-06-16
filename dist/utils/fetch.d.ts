interface FetchOptions {
    timeout?: number;
    retries?: number;
}
export declare function safeFetch(url: string, options?: FetchOptions): Promise<Response | null>;
export {};
//# sourceMappingURL=fetch.d.ts.map
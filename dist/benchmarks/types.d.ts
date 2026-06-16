export type ScoreTier = 'direct' | 'variant' | 'family' | 'curated' | 'none';
export interface BenchmarkScore {
    model_id: string;
    score: number;
    tier: ScoreTier;
    sources: {
        livebench?: number;
        arena_elo?: number;
        open_llm?: number;
    };
    last_updated: string;
}
//# sourceMappingURL=types.d.ts.map
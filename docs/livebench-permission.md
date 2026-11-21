# LiveBench permission status

Checked 2026-11-21. LiveBench's
[website repository](https://github.com/LiveBench/livebench.github.io) does not
list a license, and its README describes the website rather than permissions
for leaderboard data. The separate
[benchmark repository license](https://github.com/LiveBench/LiveBench/blob/main/LICENSE)
includes licenses for code from other projects; its applicability to the
separately hosted LiveBench 2.0 leaderboard tables is not established.

We have not verified authorization or restrictions for automated runtime
fetching, local caching, derived scores, redistribution, attribution, or
commercial use of the 2.0 table data. Absence of a discovered license is not
proof that any particular use is prohibited. Until clarified, no newly fetched
scores should be added to the distributable bundle. Existing runtime behavior
is unchanged.

## Draft request to maintainers (not sent)

> Hello LiveBench maintainers,
>
> Whollama is an MIT-licensed CLI that ranks local Ollama models. It currently
> retrieves LiveBench 2.0 release data, for example
> `https://livebench.ai/data/20261106/table.csv` and the corresponding
> `categories.json`, to calculate a suite-weighted score.
>
> Could you confirm the applicable terms for (1) automated retrieval and
> runtime use, including local caching and derived scores, and (2) bundling and
> redistributing a dated snapshot of raw or derived scores with our npm
> package? Please also indicate required attribution, any commercial-use or
> rate limits, and a stable license or terms URL if available.
>
> Thank you.

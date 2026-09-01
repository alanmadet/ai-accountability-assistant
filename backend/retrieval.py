import re
from collections import defaultdict


def search_terms(query: str, limit: int = 8) -> list[str]:
    return [
        term for term in re.findall(r"[a-z0-9@.$-]+", query.casefold())
        if len(term) > 1
    ][:limit]


def reciprocal_rank_fusion(
    ranked_lists: list[list[str]],
    weights: list[float] | None = None,
    k: int = 60,
) -> list[str]:
    weights = weights or [1.0] * len(ranked_lists)
    scores = defaultdict(float)
    for ranked_ids, weight in zip(ranked_lists, weights):
        for rank, item_id in enumerate(ranked_ids):
            scores[item_id] += weight / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)

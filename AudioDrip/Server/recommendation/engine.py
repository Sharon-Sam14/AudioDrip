from .behavior import get_behavior_recommendations
from .content import get_similar_songs, get_semantic_similar_songs


def get_recommendations(song_id):
    song_id = str(song_id or "").strip()
    if not song_id:
        return {"behavior_based": [], "content_based": []}

    behavior_ids = [candidate for candidate in get_behavior_recommendations(song_id, limit=5) if candidate != song_id]
    behavior_seen = set(behavior_ids)

    content_ids = []
    
    # 1. Priority content: Semantic text-embeddings match
    semantic_ids = get_semantic_similar_songs(song_id, limit=5)
    for candidate in semantic_ids:
        if candidate == song_id or candidate in behavior_seen:
            continue
        content_ids.append(candidate)

    # 2. Priority content: Acoustic features matching
    semantic_seen = set(content_ids)
    for candidate in get_similar_songs(song_id, limit=5):
        if candidate == song_id or candidate in behavior_seen or candidate in semantic_seen:
            continue
        content_ids.append(candidate)

    return {
        "behavior_based": behavior_ids,
        "content_based": content_ids[:5],
    }


def get_up_next(song_id, limit=10):
    song_id = str(song_id or "").strip()
    max_results = max(0, int(limit))
    if not song_id or max_results == 0:
        return []

    combined = []
    seen = {song_id}

    # 1. Behavior transitions
    for candidate in get_behavior_recommendations(song_id, limit=max_results):
        if candidate in seen:
            continue
        combined.append({"song_id": candidate, "reason": "behavior"})
        seen.add(candidate)
        if len(combined) >= max_results:
            return combined

    # 2. Semantic text-embedding similarity
    remaining = max_results - len(combined)
    if remaining > 0:
        for candidate in get_semantic_similar_songs(song_id, limit=max_results):
            if candidate in seen:
                continue
            combined.append({"song_id": candidate, "reason": "semantic"})
            seen.add(candidate)
            if len(combined) >= max_results:
                return combined

    # 3. Acoustic metadata similarity
    remaining = max_results - len(combined)
    if remaining > 0:
        for candidate in get_similar_songs(song_id, limit=max_results):
            if candidate in seen:
                continue
            combined.append({"song_id": candidate, "reason": "content"})
            seen.add(candidate)
            if len(combined) >= max_results:
                break

    return combined

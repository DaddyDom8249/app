"""Deterministic fallback generators for BeatVision.

These are used when Claude is unavailable (budget exhausted, timeout, JSON parse error,
network failure). They produce a schema-shaped payload built from the user's inputs and
the selected style preset — no fake AI wording. The frontend surfaces the _fallback flag
so the user knows this is demo output, not real Claude generation.
"""
from typing import List, Dict, Any


STYLE_PALETTES: Dict[str, Dict[str, Any]] = {
    "dark_cinematic_surreal": {
        "colors": ["deep charcoal", "bone white", "arterial red", "moonlit blue"],
        "mood": "haunting and reverent",
        "camera": "slow steadicam, extreme close-ups, wide desolate frames",
        "symbols": ["broken mirror", "empty coat", "single flickering bulb"],
    },
    "neon_cyberpunk": {
        "colors": ["electric cyan", "hot magenta", "toxic yellow", "wet black"],
        "mood": "restless and hyperreal",
        "camera": "handheld glide, dutch angles, reflective surfaces",
        "symbols": ["holographic ad", "rain-slick street", "cracked visor"],
    },
    "southern_gothic": {
        "colors": ["dust ochre", "swamp green", "kerosene amber", "faded denim"],
        "mood": "sun-bleached and weighted",
        "camera": "static wides, long dolly pulls, screen-door reveals",
        "symbols": ["burning cross of light", "porch swing", "wilted magnolia"],
    },
    "emotional_documentary": {
        "colors": ["neutral gray", "warm beige", "muted olive", "pale sky"],
        "mood": "tender and observed",
        "camera": "handheld, close-focus on hands and eyes, natural light",
        "symbols": ["family photograph", "worn hands", "empty chair"],
    },
    "apocalyptic_industrial": {
        "colors": ["rust orange", "concrete gray", "sulfur yellow", "blood black"],
        "mood": "wounded and mechanical",
        "camera": "wide industrial vistas, slow tilts, sparks in frame",
        "symbols": ["broken clock", "smokestack", "corroded chain"],
    },
    "dreamlike_fantasy": {
        "colors": ["pearl lilac", "gold leaf", "cloud pink", "midnight teal"],
        "mood": "weightless and enchanted",
        "camera": "floating crane, dissolves, mirror match cuts",
        "symbols": ["floating candle", "unfolding rose", "moth in flight"],
    },
    "horror_music_video": {
        "colors": ["blood crimson", "candle amber", "bone white", "ink black"],
        "mood": "hushed and predatory",
        "camera": "prowling low angles, sudden zooms, negative space",
        "symbols": ["cracked doll", "long hallway", "static-filled TV"],
    },
    "anime_visual_world": {
        "colors": ["sakura pink", "cel-shade blue", "sunburst gold", "storm violet"],
        "mood": "aching and luminous",
        "camera": "iconic slow pans, bokeh-heavy close-ups, wind-in-hair moments",
        "symbols": ["falling petal", "distant train", "abandoned classroom"],
    },
    "gritty_street_realism": {
        "colors": ["asphalt gray", "sodium orange", "denim indigo", "brake-light red"],
        "mood": "unblinking and lived-in",
        "camera": "shoulder-mount, long lens compression, no cutaways",
        "symbols": ["chain-link fence", "creased sneaker", "corner bodega glow"],
    },
    "cosmic_spiritual": {
        "colors": ["deep-space indigo", "solar gold", "nebula magenta", "starlight white"],
        "mood": "reverent and infinite",
        "camera": "cosmic zooms, symmetry, sacred geometry framing",
        "symbols": ["open eye", "spiral galaxy", "single hand outstretched"],
    },
}


def _style_key(style_id: str) -> Dict[str, Any]:
    return STYLE_PALETTES.get(style_id, STYLE_PALETTES["dark_cinematic_surreal"])


def _photos_summary(photos: List[Any]) -> List[str]:
    return [f"{p.type} — {p.description or p.fileName or 'reference photo'}" for p in (photos or [])]


def world_report_fallback(req) -> Dict[str, Any]:
    s = _style_key(req.style)
    photos_used = _photos_summary(req.referencePhotos)
    title = req.title or "Untitled"
    artist = req.artist or "Unknown Artist"
    return {
        "song_title": title,
        "artist": artist,
        "selected_style": req.style,
        "reference_photos_used": photos_used,
        "core_emotional_themes": ["longing", "transformation", "solitude"],
        "mood": s["mood"],
        "logline": f"'{title}' by {artist} — a {s['mood']} descent through a world shaped by {req.style.replace('_', ' ')}.",
        "visual_world_setting": f"A world rendered in {req.style.replace('_', ' ')}. Colors are dominated by {', '.join(s['colors'])}.",
        "main_protagonist": "A solitary figure whose face is only fully seen once, in the final beat.",
        "visual_conflict": "The protagonist is pulled between staying anonymous and being seen — the world resists them.",
        "color_palette": s["colors"],
        "symbols": s["symbols"],
        "camera_language": s["camera"],
        "seven_story_beats": [
            {"beat": 1, "title": "Threshold", "description": "We meet the protagonist inside the world; the mood is set with a single wide."},
            {"beat": 2, "title": "First Symbol", "description": "A recurring object appears and is quietly disturbed."},
            {"beat": 3, "title": "Chase", "description": "Movement escalates. The camera never quite catches up."},
            {"beat": 4, "title": "Reveal", "description": "A hidden truth about the protagonist surfaces via reflection or shadow."},
            {"beat": 5, "title": "Fracture", "description": "The world literally cracks — palette shifts, symbols multiply."},
            {"beat": 6, "title": "Confrontation", "description": "Protagonist faces the source of the conflict head-on."},
            {"beat": 7, "title": "After", "description": "Stillness. The final frame lingers longer than expected."},
        ],
        "ai_visual_direction_prompt": (
            f"Music video for '{title}' in {req.style.replace('_', ' ')} style. "
            f"Palette: {', '.join(s['colors'])}. Mood: {s['mood']}. "
            f"Camera language: {s['camera']}. Symbols: {', '.join(s['symbols'])}."
        ),
        "creator_memory_style_note": (
            f"{artist} favors a {s['mood']} tone with careful attention to "
            f"{'reference photos: ' + ', '.join(photos_used) if photos_used else 'symbolism and negative space'}."
        ),
        "reference_photo_influence": (
            f"Uploaded references guide protagonist appearance, environment textures, and wardrobe. "
            f"Types on file: {', '.join(sorted({p.type for p in (req.referencePhotos or [])})) or 'none'}."
        )
        if req.referencePhotos else "No reference photos uploaded; direction derived from style preset + title.",
        "approval_questions": [
            "Does the mood match how the song actually feels to you?",
            "Are the symbols the ones you want carried through all 8 scenes?",
            "Is the protagonist description close enough for the character sheet?",
            "Should any color be swapped or added to the palette?",
        ],
    }


def world_assets_fallback(req) -> Dict[str, Any]:
    s = _style_key(req.style)
    return {
        "world_style_bible": {
            "overall_look": f"{req.style.replace('_', ' ')} — {s['mood']}",
            "lighting": "single dominant source, deep shadows, practical bulbs preferred",
            "color_rules": f"Anchor to {', '.join(s['colors'])}. No colors outside this palette without a symbolic reason.",
            "camera_rules": s["camera"],
            "texture_material_rules": "Every surface reads as touchable — grain, dust, moisture, or wear.",
            "symbol_rules": f"{', '.join(s['symbols'])} recur across all 8 scenes.",
            "reference_photo_usage_rules": "Character/environment/outfit refs guide continuity; mood refs guide grade.",
            "what_to_avoid": "Perfect symmetry, generic stock backdrops, flat frontal lighting, digital-looking gradients.",
        },
        "character_sheet": {
            "name_role": "The Protagonist",
            "appearance": "Age ambiguous, expressive eyes, weathered hands, one distinctive feature that never changes across scenes.",
            "clothing": "One core outfit; small variations only (jacket on/off).",
            "emotional_state": s["mood"],
            "signature_object": s["symbols"][0] if s["symbols"] else "a small heirloom",
            "consistency_rules": "Same wardrobe, same silhouette, same posture across scenes 1–8.",
            "character_reference_photo_notes": "Use uploaded character refs (if any) for face structure and wardrobe silhouette only — do not copy their pose.",
        },
        "environment_sheet": {
            "main_location": f"A world shaped by {req.style.replace('_', ' ')}",
            "atmosphere": s["mood"],
            "time_of_day": "blue hour or deep night",
            "weather": "still air, slight haze",
            "key_objects": s["symbols"],
            "background_details": "Layered depth: foreground textures, mid-ground protagonist, background suggestive of a larger world.",
            "consistency_rules": "Same environment palette across all scenes; only lighting shifts by beat.",
            "environment_reference_photo_notes": "Environment refs (if any) set architecture and materials — not framing.",
        },
    }


def storyboard_fallback(req) -> Dict[str, Any]:
    s = _style_key(req.style)
    ref_ids = [p.id for p in (req.referencePhotos or [])]
    titles = [
        "Threshold", "First Symbol", "Chase", "Reveal",
        "Fracture", "Confrontation", "Stillness", "After",
    ]
    descs = [
        "Establish the world. Protagonist alone in wide frame.",
        "A recurring symbol appears and is disturbed.",
        "Movement escalates; camera struggles to keep up.",
        "A hidden truth surfaces via reflection or shadow.",
        "The world literally cracks; palette shifts.",
        "Protagonist faces the source of the conflict.",
        "The tension breaks into silence.",
        "A last lingering frame the audience won't shake.",
    ]
    cameras = [
        "slow push-in", "static wide", "handheld pursuit", "mirror match cut",
        "dutch angle drift", "locked-off head-on", "slow crane up", "very slow zoom out",
    ]
    symbols_cycle = (s["symbols"] * 3)[:8]
    return {
        "scenes": [
            {
                "scene_number": i + 1,
                "timestamp_range": f"{i*22//60}:{(i*22)%60:02d} - {((i+1)*22)//60}:{((i+1)*22)%60:02d}",
                "scene_title": titles[i],
                "description": descs[i],
                "camera_movement": cameras[i],
                "color_emphasis": s["colors"][i % len(s["colors"])],
                "symbol": symbols_cycle[i],
                "reference_photo_ids": ref_ids[: min(2, len(ref_ids))],
                "visual_prompt": f"{titles[i]} — {descs[i]} Camera: {cameras[i]}. Palette anchored on {s['colors'][i % len(s['colors'])]}.",
            }
            for i in range(8)
        ]
    }


def scene_prompts_fallback(req) -> Dict[str, Any]:
    s = _style_key(req.style)
    scenes = req.storyboard or []
    prompts = []
    for sc in scenes:
        n = sc.get("scene_number", 0)
        prompts.append({
            "scene_number": n,
            "scene_description": sc.get("description", ""),
            "character_consistency_notes": "Same silhouette, clothing, and one distinctive feature as previous scenes.",
            "environment_consistency_notes": "Same environment palette; only lighting shifts by beat.",
            "uploaded_reference_photo_guidance": (
                "Mirror the wardrobe, face structure, and environment textures from the assigned reference photos. "
                "Do not copy their poses or exact framing."
            ),
            "style_bible_notes": f"{req.style.replace('_', ' ')}. Palette {', '.join(s['colors'])}. Mood {s['mood']}.",
            "camera_angle": sc.get("camera_movement", s["camera"]),
            "lighting": "single dominant source, deep shadow separation, filmic grain",
            "mood": s["mood"],
            "negative_prompt": "no watermarks, no text overlays, no distorted anatomy, no low-quality artifacts, no double faces",
            "final_polished_prompt": (
                f"Cinematic still, {req.style.replace('_', ' ')} style. "
                f"Scene {n}: {sc.get('scene_title','')} — {sc.get('description','')}. "
                f"Camera: {sc.get('camera_movement','')}. Palette: {', '.join(s['colors'][:3])}. "
                f"Symbol: {sc.get('symbol','')}. Mood: {s['mood']}. "
                f"Reference photos: guide wardrobe, environment, and mood only."
            ),
        })
    return {"prompts": prompts}

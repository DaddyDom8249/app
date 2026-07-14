export const STYLE_PRESETS = [
  { id: "dark_cinematic_surreal", label: "Dark Cinematic Surreal" },
  { id: "neon_cyberpunk", label: "Neon Cyberpunk" },
  { id: "southern_gothic", label: "Southern Gothic" },
  { id: "emotional_documentary", label: "Emotional Documentary" },
  { id: "apocalyptic_industrial", label: "Apocalyptic Industrial" },
  { id: "dreamlike_fantasy", label: "Dreamlike Fantasy" },
  { id: "horror_music_video", label: "Horror Music Video" },
  { id: "anime_visual_world", label: "Anime Visual World" },
  { id: "gritty_street_realism", label: "Gritty Street Realism" },
  { id: "cosmic_spiritual", label: "Cosmic Spiritual" },
];

export const REFERENCE_TYPES = [
  { id: "main_character", label: "Main Character" },
  { id: "environment", label: "Environment" },
  { id: "outfit", label: "Outfit" },
  { id: "object_symbol", label: "Object / Symbol" },
  { id: "mood", label: "Mood / Visual Style" },
];

export const MOTION_TYPES = [
  "slow zoom",
  "pan left",
  "push in",
  "shake",
  "fade",
  "glitch",
  "lyric caption moment",
];

export const styleLabel = (id) =>
  STYLE_PRESETS.find((s) => s.id === id)?.label || id;

export const refTypeLabel = (id) =>
  REFERENCE_TYPES.find((r) => r.id === id)?.label || id;

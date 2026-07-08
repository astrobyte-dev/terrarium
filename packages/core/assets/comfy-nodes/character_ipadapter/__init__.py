"""
CharacterReferenceLoader

Loads a reference image for a named character from the openclaw character
library at `~/.openclaw/workspace/characters/refs/<name>.{jpg,png,webp,jpeg}`.

If no reference exists (or no character is selected), returns a black
placeholder image + weight=0 so IPAdapter is effectively a no-op. If a
reference exists, returns the loaded tensor + the configured weight.

Designed to be chained into IPAdapter Plus nodes: the weight output should
be wired into IPAdapterAdvanced.weight so the workflow degrades gracefully
when a character has no ref photo yet.
"""
import os
import re
import numpy as np
import torch
from PIL import Image, ImageOps


DEFAULT_REF_DIR = os.path.join(
    os.path.expanduser("~"), ".openclaw", "workspace", "characters", "refs"
)
SUPPORTED_EXTS = (".jpg", ".jpeg", ".png", ".webp")
NAME_SAFE_RE = re.compile(r"[^a-zA-Z0-9_-]")


def _safe_name(name):
    return NAME_SAFE_RE.sub("", (name or "").strip().lower())


def _find_ref(ref_dir, name):
    safe = _safe_name(name)
    if not safe:
        return None
    for ext in SUPPORTED_EXTS:
        candidate = os.path.join(ref_dir, f"{safe}{ext}")
        if os.path.isfile(candidate):
            return candidate
    return None


def _load_image_tensor(path):
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def _placeholder():
    return torch.zeros((1, 1024, 1024, 3), dtype=torch.float32)


class CharacterReferenceLoader:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "character_name": ("STRING", {"forceInput": True}),
                "ref_dir": ("STRING", {"default": DEFAULT_REF_DIR}),
                "weight_when_found": ("FLOAT", {
                    "default": 0.85, "min": 0.0, "max": 2.0, "step": 0.05,
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "FLOAT", "STRING", "BOOLEAN")
    RETURN_NAMES = ("ref_image", "weight", "ref_name", "found")
    FUNCTION = "load"
    CATEGORY = "utils"

    def load(self, character_name, ref_dir, weight_when_found):
        path = _find_ref(ref_dir or DEFAULT_REF_DIR, character_name)
        if path is None:
            return (_placeholder(), 0.0, "", False)
        return (
            _load_image_tensor(path),
            weight_when_found,
            os.path.splitext(os.path.basename(path))[0],
            True,
        )


NODE_CLASS_MAPPINGS = {"CharacterReferenceLoader": CharacterReferenceLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"CharacterReferenceLoader": "Character Reference Loader"}

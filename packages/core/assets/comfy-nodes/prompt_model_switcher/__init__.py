import re
import folder_paths
import comfy.sd


PONY_POSITIVE = (
    "score_9, score_8_up, score_7_up, rating_explicit, solo, 1girl, "
    "raw photo, amateur photo, candid photo, snapshot, photorealistic, "
    "natural skin texture, visible skin pores, realistic skin, soft natural lighting, "
    "shallow depth of field, 35mm film, kodak portra, sharp focus, "
    "perfect anatomy, detailed face, detailed eyes, detailed hands, five fingers, "
    "detailed feet, five toes, detailed nails"
)

PONY_NEGATIVE = (
    "score_6, score_5, score_4, rating_safe, "
    "painting, drawing, illustration, fashion illustration, oil painting, watercolor, "
    "concept art, render, 3d render, cgi, plastic skin, airbrushed, smooth skin, "
    "doll-like, fashion editorial, magazine cover, photoshoot, beauty retouch, "
    "soft focus, glow, hdr, oversaturated, "
    "multiple girls, 2girls, 3girls, multiple women, multiple people, multiple subjects, "
    "group shot, side by side, split image, collage, comparison shot, "
    "source_pony, source_furry, source_cartoon, anime, manga, monochrome, simple background, "
    "lowres, bad anatomy, bad proportions, bad hands, bad feet, deformed hands, "
    "deformed feet, malformed hands, malformed feet, mutated hands, mutated feet, "
    "extra fingers, fused fingers, missing fingers, too many fingers, extra toes, "
    "fused toes, missing toes, six toes, seven toes, more than five toes, "
    "extra limbs, missing limbs, fused limbs, mutated limbs, malformed limbs, "
    "censored, mosaic censoring, bar censor, text, error, cropped, "
    "worst quality, low quality, jpeg artifacts, signature, watermark, username, "
    "blurry, ugly, deformed, disfigured, mutated, weird anatomy, distorted face, "
    "asymmetric eyes, large eyes, anime eyes, manga eyes, doe eyes"
)

# BigASP and Lustify are non-Pony SDXL fine-tunes — Pony-specific tags
# (score_*, rating_*, source_*) hurt or break them. Use plain natural-quality
# boosters and standard SDXL negatives instead.
SDXL_POSITIVE = (
    "solo, 1girl, raw photo, amateur photo, candid photo, snapshot, "
    "photorealistic, natural skin texture, visible skin pores, realistic skin, "
    "soft natural lighting, shallow depth of field, 35mm film, kodak portra, "
    "sharp focus, perfect anatomy, detailed face, detailed eyes, detailed hands, "
    "five fingers, detailed feet, five toes, detailed nails"
)

SDXL_NEGATIVE = (
    "painting, drawing, illustration, fashion illustration, oil painting, watercolor, "
    "concept art, render, 3d render, cgi, plastic skin, airbrushed, smooth skin, "
    "doll-like, fashion editorial, magazine cover, photoshoot, beauty retouch, "
    "soft focus, glow, hdr, oversaturated, "
    "diptych, triptych, photo grid, photo collage, magazine layout, magazine spread, "
    "contact sheet, picture frame, framed photo, photo border, before and after, "
    "split frame, multi-panel, comic panel, "
    "multiple girls, 2girls, 3girls, multiple women, multiple people, multiple subjects, "
    "group shot, side by side, split image, collage, comparison shot, "
    "anime, manga, cartoon, monochrome, simple background, "
    "lowres, bad anatomy, bad proportions, bad hands, bad feet, deformed hands, "
    "deformed feet, malformed hands, malformed feet, mutated hands, mutated feet, "
    "extra fingers, fused fingers, missing fingers, too many fingers, extra toes, "
    "fused toes, missing toes, six toes, seven toes, more than five toes, "
    "extra limbs, missing limbs, fused limbs, mutated limbs, malformed limbs, "
    "censored, mosaic censoring, bar censor, text, error, cropped, worst quality, "
    "low quality, jpeg artifacts, signature, watermark, username, blurry, ugly, "
    "deformed, disfigured, mutated, weird anatomy, distorted face, asymmetric eyes, "
    "large eyes, anime eyes, manga eyes, doe eyes"
)

QUALITY_BY_LABEL = {
    "pony":    (PONY_POSITIVE, PONY_NEGATIVE),
    "bigasp":  (SDXL_POSITIVE, SDXL_NEGATIVE),
    "lustify": (SDXL_POSITIVE, SDXL_NEGATIVE),
    "default": (PONY_POSITIVE, PONY_NEGATIVE),
}


class PromptModelSwitcher:
    """
    Reads `MODEL: <name>` from the prompt produced by the upstream LLM, picks the
    matching checkpoint, loads it, and returns model/clip/vae plus the cleaned
    tags AND the per-model positive-quality and negative prompts (since Pony tags
    poison non-Pony checkpoints like BigASP/Lustify).
    """

    @classmethod
    def INPUT_TYPES(cls):
        ckpts = folder_paths.get_filename_list("checkpoints")
        return {
            "required": {
                "raw_prompt": ("STRING", {"forceInput": True}),
                "default_ckpt": (ckpts,),
                "pony_ckpt": (ckpts,),
                "bigasp_ckpt": (ckpts,),
                "lustify_ckpt": (ckpts,),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "model", "clip", "vae",
        "tags", "selected_name",
        "quality_positive", "quality_negative",
        "character_name",
    )
    FUNCTION = "switch"
    CATEGORY = "utils"

    PREFIX_RE = re.compile(
        r"^\s*MODEL\s*[:=]\s*([a-zA-Z0-9 _-]+?)\s*(?:[\n,;]|$)(.*)",
        re.DOTALL | re.IGNORECASE,
    )
    CHARACTER_RE = re.compile(
        r"^\s*CHARACTER\s*[:=]\s*([a-zA-Z0-9 _-]+?)\s*(?:[\n,;]|$)(.*)",
        re.DOTALL | re.IGNORECASE,
    )

    def _resolve(self, name, pony_ckpt, bigasp_ckpt, lustify_ckpt, default_ckpt):
        n = name.lower().strip()
        if any(k in n for k in ("bigasp", "big asp", "asp")):
            return bigasp_ckpt, "bigasp"
        if any(k in n for k in ("lustify", "lust")):
            return lustify_ckpt, "lustify"
        if any(k in n for k in ("pony", "cyber")):
            return pony_ckpt, "pony"
        return default_ckpt, "default"

    def switch(self, raw_prompt, default_ckpt, pony_ckpt, bigasp_ckpt, lustify_ckpt):
        text = raw_prompt or ""
        match = self.PREFIX_RE.match(text)
        if match:
            chosen_name = match.group(1)
            text = match.group(2).lstrip(" \t\n,;:")
            ckpt, label = self._resolve(
                chosen_name, pony_ckpt, bigasp_ckpt, lustify_ckpt, default_ckpt
            )
        else:
            ckpt = default_ckpt
            label = "default"

        char_match = self.CHARACTER_RE.match(text)
        if char_match:
            character_name = char_match.group(1).strip().lower()
            tags = char_match.group(2).lstrip(" \t\n,;:").strip()
        else:
            character_name = ""
            tags = text.strip()

        ckpt_path = folder_paths.get_full_path("checkpoints", ckpt)
        out = comfy.sd.load_checkpoint_guess_config(
            ckpt_path,
            output_vae=True,
            output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
        )
        model, clip, vae = out[0], out[1], out[2]
        positive, negative = QUALITY_BY_LABEL.get(label, QUALITY_BY_LABEL["default"])
        return (model, clip, vae, tags, label, positive, negative, character_name)


NODE_CLASS_MAPPINGS = {"PromptModelSwitcher": PromptModelSwitcher}
NODE_DISPLAY_NAME_MAPPINGS = {"PromptModelSwitcher": "Prompt Model Switcher"}

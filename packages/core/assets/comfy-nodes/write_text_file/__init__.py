"""
WriteTextFile — write a string to disk. Used by the workflow to save the
post-image vision-model description so the chat agent can read it back
on its next reply for context-aware commentary.

The text input is forced (must come from upstream) so this node always
re-runs when its input changes.
"""
import os
import random


class WriteTextFile:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
                "path": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("path",)
    FUNCTION = "write"
    CATEGORY = "utils"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return random.random()

    def write(self, text, path):
        path = (path or "").strip()
        if not path:
            return ("",)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text or "")
        return (path,)


NODE_CLASS_MAPPINGS = {"WriteTextFile": WriteTextFile}
NODE_DISPLAY_NAME_MAPPINGS = {"WriteTextFile": "Write Text File"}

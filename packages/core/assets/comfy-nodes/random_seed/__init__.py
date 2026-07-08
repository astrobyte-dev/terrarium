import random


class RandomSeed:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"max": ("INT", {"default": 4294967295, "min": 0, "max": 4294967295})}}

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "generate"
    CATEGORY = "utils"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return random.random()

    def generate(self, max):
        return (random.randint(0, max),)


NODE_CLASS_MAPPINGS = {"RandomSeed": RandomSeed}
NODE_DISPLAY_NAME_MAPPINGS = {"RandomSeed": "Random Seed"}

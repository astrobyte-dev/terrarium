"""Small shared adapter for the installed image daemon. No third-party dependencies."""
import json
import os
import re
import shutil
import time
import urllib.request
import uuid
from pathlib import Path

DATA = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'Terrarium'
WORKSPACE = Path.home() / '.openclaw' / 'workspace'
BROKER = 'http://127.0.0.1:18790'


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError):
        return default


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    tmp.write_text(json.dumps(value), encoding='utf-8')
    os.replace(tmp, path)


def metric(stage, **fields):
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        with (DATA / 'image-performance.jsonl').open('a', encoding='utf-8') as f:
            f.write(json.dumps(dict(ts=int(time.time() * 1000), stage=stage, **fields)) + '\n')
    except OSError:
        pass


def configure_generate(module):
    if getattr(module, '_terrarium_configured', False):
        return
    module._terrarium_configured = True
    if read_json(DATA / 'performance.json', {}).get('enabled'):
        module.COMFY = BROKER + '/comfy'
    original = module.build_workflow

    def workflow(*args, **kwargs):
        prompt = str(args[0] if args else kwargs.get('prompt', ''))
        if re.search(r'\b(?:child(?:ren)?|underage|adolescent|preteen|teenager|loli|shota)\b|\b(?:[1-9]|1[0-7])[- ]*(?:years?[- ]*old|yo|y/o)\b', prompt, re.I):
            raise ValueError('Companion image generation requires adult subjects.')
        wf = original(*args, **kwargs)
        settings = read_json(DATA / 'gen_settings.json', {})
        preset = settings.get('preset', 'quality')
        if preset == 'preview':
            wf['4']['inputs'].update(width=768, height=1024)
            wf['5']['inputs']['steps'] = 18
            for node in ['20', '21', '22', '23']:
                wf.pop(node, None)
            wf['7']['inputs']['images'] = ['6', 0]
        elif preset == 'balanced' and '21' in wf:
            wf.pop('22', None)
            wf.pop('23', None)
            wf['7']['inputs']['images'] = ['21', 0]
        elif preset == 'lightning':
            # Separate distilled model with its documented sampler schedule.
            wf['1']['inputs']['ckpt_name'] = 'sdxl_lightning_4step.safetensors'
            wf['5']['inputs'].update(model=['1', 0], steps=4, cfg=1.0,
                                    sampler_name='euler', scheduler='sgm_uniform')
            wf['2']['inputs']['text'] = 'Photograph of an adult, ' + str(args[0] if args else kwargs.get('prompt', ''))
            for node in ['8', '10', '11', '12', '20', '21', '22', '23']:
                wf.pop(node, None)
            wf['7']['inputs']['images'] = ['6', 0]
        return wf
    module.build_workflow = workflow


def local_chat(model, messages, max_tokens=256, temperature=0.8):
    output = max(32, min(int(max_tokens), 1024))
    required = len(json.dumps(messages, ensure_ascii=False).encode('utf-8')) + output + 256
    context = next((n for n in (4096, 8192, 16384, 24576) if n >= required), None)
    if context is None:
        return None
    root = BROKER + '/ollama' if read_json(DATA / 'performance.json', {}).get('enabled') else 'http://127.0.0.1:11434'
    payload = dict(model=model, messages=messages, stream=False, keep_alive='20s',
                   options=dict(temperature=temperature, num_predict=output, num_ctx=context))
    if 'qwen3' in model:
        payload['think'] = False
    req = urllib.request.Request(root + '/api/chat', data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json', 'X-Terrarium-Priority': 'background'})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.load(response)
        metric('helper', totalMs=round((time.monotonic() - started) * 1000),
               loadMs=data.get('load_duration', 0) / 1e6, context=context,
               promptTokens=data.get('prompt_eval_count'), outputTokens=data.get('eval_count'))
        return data.get('message', {}).get('content', '').strip() or None
    except Exception:
        metric('helper-failed', totalMs=round((time.monotonic() - started) * 1000))
        return None


def publish(paths, caption, character, prompt, params, command=None):
    """Return a stable manifest so a later caption updates the same images/bubble."""
    inbox = DATA / 'inbox'
    inbox.mkdir(parents=True, exist_ok=True)
    names = []
    for path in paths:
        path = Path(path)
        name = 'img_' + uuid.uuid4().hex + path.suffix
        shutil.copyfile(path, inbox / name)
        names.append(name)
    manifest = dict(id=uuid.uuid4().hex, revision=1, images=names, caption=caption or '',
                    character=character, prompt=prompt, command=command, params=params,
                    sessionKey='agent:main:main', ts=int(time.time() * 1000))
    atomic_json(inbox / (manifest['id'] + '.json'), manifest)
    metric('image-published', imageId=manifest['id'], count=len(names))
    return manifest


def update_caption(manifest, caption):
    if not manifest or not caption:
        return
    manifest = dict(manifest, caption=caption, revision=manifest.get('revision', 1) + 1)
    atomic_json(DATA / 'inbox' / (manifest['id'] + '.json'), manifest)
    metric('caption-published', imageId=manifest['id'], elapsedMs=int(time.time() * 1000) - manifest['ts'])


def scene_for(character):
    if not isinstance(character, str) or not all(c.isalnum() or c == '-' for c in character):
        return {}
    return read_json(WORKSPACE / 'memory' / 'characters' / (character.lower() + '.scene.json'), {})


def install(namespace):
    configure_generate(namespace['generate'])
    namespace['_local_chat'] = lambda messages, max_tokens=256, temperature=0.8: local_chat(
        namespace['OLLAMA_TEXT_MODEL'], messages, max_tokens, temperature)
    namespace['mirror_to_inbox'] = publish
    namespace['update_caption'] = update_caption
    namespace['scene_for'] = scene_for
    namespace['performance_metric'] = metric
    original_command = namespace['handle_command']
    def handle_command(state, text):
        result = original_command(state, text)
        if text.strip().lower().startswith('/be '):
            atomic_json(WORKSPACE / 'active-character.json', {'character': state.get('character')})
        return result
    namespace['handle_command'] = handle_command
    original_files = namespace['transcript_files']
    def transcript_files():
        registry = read_json(namespace['SESSIONS'] / 'sessions.json', {})
        excluded = {v.get('sessionId') for key, v in registry.items()
                    if 'performance-validation-' in key and isinstance(v, dict)}
        return [f for f in original_files() if f.stem not in excluded]
    namespace['transcript_files'] = transcript_files


def queue_delivery(paths, chat_id, caption):
    atomic_json(DATA / 'delivery-outbox' / (uuid.uuid4().hex + '.json'),
                dict(paths=[str(p) for p in paths], chat_id=chat_id, caption=caption, attempts=0, next=time.time() + 60))


_last_retry = 0
def retry_delivery(generate):
    global _last_retry
    if time.time() - _last_retry < 60:
        return
    _last_retry = time.time()
    for file in (DATA / 'delivery-outbox').glob('*.json'):
        item = read_json(file, {})
        if item.get('attempts', 3) >= 3 or item.get('next', 0) > time.time():
            continue
        try:
            paths = [Path(p) for p in item['paths']]
            if len(paths) == 1:
                generate.send_telegram(paths[0], item['chat_id'], item.get('caption'))
            else:
                generate.send_telegram_album(paths, item['chat_id'], item.get('caption'))
            file.unlink()
        except Exception:
            item['attempts'] += 1
            item['next'] = time.time() + 60 * 2 ** item['attempts']
            atomic_json(file, item)
        break

import importlib.util
import ast
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

source = Path(__file__).resolve().parents[1] / 'packages/core/assets/performance/terrarium_performance.py'
spec = importlib.util.spec_from_file_location('performance', source)
performance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(performance)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        performance.DATA = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_caption_update_preserves_image_identity_and_files(self):
        path = performance.DATA / 'source.png'
        path.write_bytes(b'fixture')
        original = performance.publish([path], None, 'mira', 'clothed portrait', {'seed': 42})
        performance.update_caption(original, 'Hello!')
        manifest = json.loads((performance.DATA / 'inbox' / (original['id'] + '.json')).read_text())
        self.assertEqual(manifest['images'], original['images'])
        self.assertEqual(manifest['ts'], original['ts'])
        self.assertEqual(manifest['caption'], 'Hello!')
        self.assertEqual(len(list((performance.DATA / 'inbox').glob('*.png'))), 1)

    def test_failed_telegram_delivery_retries_without_regeneration(self):
        performance.queue_delivery([Path('photo.png')], 1, 'caption')
        file = next((performance.DATA / 'delivery-outbox').glob('*.json'))
        item = json.loads(file.read_text()); item['next'] = 0; performance.atomic_json(file, item)
        performance._last_retry = 0
        calls = []
        generator = SimpleNamespace(send_telegram=lambda *args: calls.append(args))
        performance.retry_delivery(generator)
        self.assertEqual(len(calls), 1)
        self.assertFalse(file.exists())

    def test_preview_disconnects_removed_detailer_nodes(self):
        performance.atomic_json(performance.DATA / 'gen_settings.json', {'preset': 'preview'})
        fake = SimpleNamespace(COMFY='', build_workflow=lambda: {
            str(n): {'inputs': {}} for n in [1, 2, 3, 4, 5, 6, 7, 20, 21, 22, 23]})
        performance.configure_generate(fake)
        graph = fake.build_workflow()
        self.assertEqual(graph['7']['inputs']['images'], ['6', 0])
        self.assertEqual(graph['5']['inputs']['steps'], 18)
        self.assertNotIn('21', graph)

    def test_diagnostic_sessions_do_not_feed_companion_memory(self):
        sessions = performance.DATA / 'sessions'; sessions.mkdir()
        performance.atomic_json(sessions / 'sessions.json', {
            'agent:main:performance-validation-test': {'sessionId': 'diagnostic'},
            'agent:main:main': {'sessionId': 'conversation'}})
        ns = dict(generate=SimpleNamespace(COMFY='', build_workflow=lambda: {}),
                  handle_command=lambda *_: None, transcript_files=lambda: [sessions / 'diagnostic.jsonl', sessions / 'conversation.jsonl'],
                  SESSIONS=sessions)
        performance.install(ns)
        self.assertEqual([p.stem for p in ns['transcript_files']()], ['conversation'])

    def test_installed_delivery_publishes_before_caption_and_external_delivery(self):
        live = Path.home() / '.openclaw/workspace/skills/comfyui-imagegen/pic_daemon.py'
        if not live.exists():
            self.skipTest('Installed daemon unavailable')
        tree = ast.parse(live.read_text(encoding='utf-8-sig'))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'handle_pic')
        start = next(i for i, n in enumerate(fn.body) if isinstance(n, ast.Assign)
                     and any(isinstance(t, ast.Name) and t.id == 'paths' for t in n.targets))
        calls = []
        ns = dict(count=1, prompt='Adult wearing a sweater', name='fixture', anime=False, anime_ckpt=None,
                  face_lock=False, detailers=False, use_noob=False, strict=False, settings={}, scene={},
                  state={}, hd_auto=False, chat_id=0, time=performance.time,
                  mirror_to_inbox=lambda *a, **k: calls.append('publish') or {'id': 'fixture'},
                  character_caption=lambda *_: calls.append('caption') or 'Hello',
                  update_caption=lambda *_: calls.append('update'), performance_metric=lambda *a, **k: None)
        ns['generate'] = SimpleNamespace(generate=lambda *a, **k: {'seed': 42}, download=lambda _: Path('fixture.png'),
                                        send_telegram=lambda *_: calls.append('external'))
        exec(compile(ast.Module(body=fn.body[start:], type_ignores=[]), '<delivery-test>', 'exec'), ns)
        self.assertEqual(calls, ['publish', 'caption', 'update', 'external'])


if __name__ == '__main__':
    unittest.main()

"""Remove only this benchmark's diagnostic marker from observer notes, with backups."""
import json
import shutil
import time
from pathlib import Path

workspace = Path.home() / '.openclaw' / 'workspace'
marker = 'For this local connection check, reply exactly TERRARIUM_TUNED_OK.'
state_file = workspace / 'skills/comfyui-imagegen/daemon_state.json'
state = json.loads(state_file.read_text(encoding='utf-8'))
shutil.copy2(state_file, state_file.with_suffix('.json.bak.performance-' + str(int(time.time()))))
state['fact_buffer'] = [s for s in state.get('fact_buffer', []) if not s.startswith(marker)]
if state.get('last_user', '').startswith(marker):
    state.pop('last_user', None)
state['convo'] = {k: v for k, v in state.get('convo', {}).items() if not v.get('user', '').startswith(marker)}
state_file.write_text(json.dumps(state), encoding='utf-8')
for path in (workspace / 'memory').glob('*.md'):
    original = path.read_text(encoding='utf-8')
    if marker in original:
        shutil.copy2(path, path.with_suffix('.md.bak.performance-' + str(int(time.time()))))
        path.write_text('\n'.join(line for line in original.splitlines() if marker not in line) + '\n', encoding='utf-8')
print('Removed diagnostic markers from observer notes; originals backed up.')

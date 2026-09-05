import { execFile } from 'node:child_process'
let checkedAt = 0, training = false
/** Avoid competing with the separate local LoRA trainer; never stop that process. */
export async function externalTrainingActive(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  if (Date.now() - checkedAt < 2000) return training
  const command = "$p = Get-CimInstance Win32_Process -Filter \"Name = 'python.exe' OR Name = 'pythonw.exe'\"; if ($p | Where-Object { $_.CommandLine -match '(?:sdxl_)?train_network\\.py|flux_train_network\\.py' }) { '1' } else { '0' }"
  const result = await new Promise<string>((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(stdout.trim())))
  if (result !== '0' && result !== '1') throw new Error('Cannot check external GPU use')
  checkedAt = Date.now(); training = result === '1'; return training
}

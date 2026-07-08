// Test fixture: runs briefly, then exits nonzero (a crash on cue).
console.log('up')
setTimeout(() => process.exit(1), Number(process.argv[2] ?? 50))

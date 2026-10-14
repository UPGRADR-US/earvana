"""Compare delicate loop/DSP/RingMatch source against the local pre-Stage-2 checkpoint.
Run: python3 artifacts/nature-sounds/tests/verify-freeview-audio-baseline.py [checkpoint.tar]
"""
from pathlib import Path
import sys, tarfile, re, subprocess
root = Path(__file__).resolve().parents[1]
checkpoint = Path(sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/Earphoria_STAGE1_BEFORE_STAGE2_20261005.tar')
with tarfile.open(checkpoint) as archive:
    def before(path): return archive.extractfile('artifacts/nature-sounds/' + path).read().decode()
    def after(path): return (root / path).read_text()
    def section(source, start, end): return source[source.index(start):source.index(end, source.index(start))]
    swift = 'ios/App/CapApp-SPM/Sources/CapApp-SPM/CrossfadeLoopPlayer.swift'
    for start, end in [
        ('    private var effectiveXfade:', '    private var outputLevel:'),
        ('    private func normalizedEqGains', '    private func applyEqBands'),
    ]:
        # normalizedEqGains is static in this baseline; covered by full DSP block below instead.
        if start in before(swift): assert section(before(swift), start, end) == section(after(swift), start, end)
    assert section(before(swift), '    private static func normalizedEqGains', '    private func cancelCrossfadeSchedule') == section(after(swift), '    private static func normalizedEqGains', '    private func cancelCrossfadeSchedule')
    web = 'src/hooks/useWebAudioEngine.ts'
    old = section(before(web), '  scheduleNextLoop(', '  // immediate = true')
    new = section(after(web), '  scheduleNextLoop(', '  // immediate = true')
    new = new.replace('    inGain.connect(this.freeview?.gain ?? this.trackGain);', '    inGain.connect(this.trackGain);')
    new = re.sub(r'^    this.freeview\?\.source\(inSource,.*\n', '', new, flags=re.M)
    assert old == new, 'Web loop curves/timing/Safari offsets changed'
    old, new = before(web), after(web)
    for name, expected in [('DEFAULT_CROSSFADE', '40'), ('FADE_IN_DURATION', '1.5'), ('STOP_FADE_DURATION', '0.75'), ('MANUAL_PAUSE_FADE_DURATION', '0.75'), ('LEGACY_TRACK_REPLACEMENT_FADE', '0.75'), ('TRACK_SWITCH_CROSSFADE', '2.25')]:
        assert re.search(r'const '+name+r'\s*=\s*'+re.escape(expected)+r'\s*;', old)
        assert re.search(r'const '+name+r'\s*=\s*'+re.escape(expected)+r'\s*;', new)
    app = 'src/App.tsx'
    # Stage 6A authorizes only this dev entry bypass and pending-selection invalidation.
    ring_gate = section(after(app), '  const openDiag =', '  const resetRingMatch =')
    ring_gate = ring_gate.replace('if (!ringMatchFreeviewPreview && (previewFreeUser || isPremiumFeatureLocked(subscription.isSubscribed))) {', 'if (previewFreeUser || isPremiumFeatureLocked(subscription.isSubscribed)) {')
    ring_gate = ring_gate.replace('[diagHasOpened, previewFreeUser, subscription.isSubscribed, ringMatchFreeviewPreview]);', '[diagHasOpened, previewFreeUser, subscription.isSubscribed]);')
    ring_gate = ring_gate.replace('    pendingRingMatchSelection.current = null;\n', '')
    assert section(before(app), '  const openDiag =', '  const resetRingMatch =') == ring_gate
    assert section(before(app), '  /* React to timeRemaining changes:', '  const handleSelect =') == section(after(app), '  /* React to timeRemaining changes:', '  const handleSelect =')
    android = 'android/app/src/main/java/com/earvana/tinnitusrelief/PCMPlayer.java'
    assert section(before(android), '    static AudioAttributes stereoPlaybackAttributes()', '    private void audioLoop()') == section(after(android), '    static AudioAttributes stereoPlaybackAttributes()', '    private void audioLoop()')
    # Legacy DSP/limiter/loop arithmetic remains an exact ordered subsequence of the audio loop.
    old_loop = section(before(android), '    private void audioLoop()', '        Log.d(TAG, "Playback thread exiting.")')
    new_loop = section(after(android), '    private void audioLoop()', '        Log.d(TAG, "Playback thread exiting.")')
    cursor = iter(new_loop.splitlines())
    assert all(any(line == candidate for candidate in cursor) for line in old_loop.splitlines()), 'Legacy PCM arithmetic changed'
for path in ['ios/App/App/AppDelegate.swift', 'ios/App/App/Info.plist', 'android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle', 'src/sounds.ts', 'src/DiagnosticsPanel.tsx', 'android/app/src/main/java/com/earvana/tinnitusrelief/AudioDecoder.java', 'android/app/src/main/java/com/earvana/tinnitusrelief/BiquadFilter.java', 'android/app/src/main/java/com/earvana/tinnitusrelief/DiagnosticTonePlayer.java', 'ios/App/CapApp-SPM/Sources/CapApp-SPM/DiagnosticTonePlayer.swift']:
    original = subprocess.check_output(['git', 'show', 'HEAD:artifacts/nature-sounds/' + path])
    current = (root / path).read_bytes()
    if path == 'src/DiagnosticsPanel.tsx':
        # Remove precisely the approved UI boundary; every remaining byte, including tones/warnings/confirmations, must match.
        text = current.decode().replace('  /** Local web Freeview boundary; returning true defers the untouched original SELECT path. */\n  developmentSelectBoundary?: (frequency: number, resume: () => void) => boolean;\n', '')
        text = text.replace('  onNotch, currentNotch, onBoost, currentBoost, developmentSelectBoundary,', '  onNotch, currentNotch, onBoost, currentBoost,')
        text = text.replace('const initialSelectedFrequency = developmentSelectBoundary ? null : selectedFrequency ?? currentNotch ?? currentBoost;', 'const initialSelectedFrequency = selectedFrequency ?? currentNotch ?? currentBoost;')
        text = text.replace('    if (developmentSelectBoundary?.(freq, () => completeFrequencySelection(freq))) return;\n    completeFrequencySelection(freq);\n  };\n  const completeFrequencySelection = (freq: number) => {\n', '')
        current = text.encode()
    assert original == current, path
print('PASS baseline: exact loop/DSP source, Safari offsets, fade constants, RingMatch/sleep triggers, audio-session/service/build configuration and assets catalog preserved')

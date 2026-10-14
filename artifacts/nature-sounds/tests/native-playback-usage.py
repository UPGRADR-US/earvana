"""Deterministic observer tests only; compiles temporary harnesses, never mobile apps.
Run from repository root: python3 artifacts/nature-sounds/tests/native-playback-usage.py
"""
from pathlib import Path
import subprocess
import tempfile
root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='earphoria-usage-') as directory:
    work = Path(directory)
    swift = (root / 'ios/App/CapApp-SPM/Sources/CapApp-SPM/PlaybackUsage.swift').read_text()
    swift = swift.replace('private var now: Double { ProcessInfo.processInfo.systemUptime }', 'static var testTime: Double = 0\n    private var now: Double { Self.testTime }')
    swift += '''
func check(_ track: String, _ value: Double) {
    precondition(abs((PlaybackUsage.shared.snapshot()[track] ?? 0) - value) < 0.000001)
}
let usage = PlaybackUsage.shared
let a = UUID(), b = UUID(), duplicate = UUID()
usage.begin(a, track: "ocean_high_tide_beach")
PlaybackUsage.testTime = 10
check("ocean_high_tide_beach", 10)
usage.begin(duplicate, track: "ocean_high_tide_beach")
usage.begin(b, track: "forest")
usage.tail(a, seconds: 2.25); usage.tail(duplicate, seconds: 2.25)
PlaybackUsage.testTime = 15
check("ocean_high_tide_beach", 12.25); check("forest", 5)
usage.interrupt()
PlaybackUsage.testTime = 25
check("forest", 5)
usage.interruptionEnded(); usage.resume(b)
PlaybackUsage.testTime = 30
check("forest", 10)
usage.end(b)
PlaybackUsage.testTime = 100
check("forest", 10)
print("PASS Swift: process ledger, track union, overlap/tails, interruption/recovery, stop")
'''
    (work / 'main.swift').write_text(swift)
    subprocess.run(['swiftc', '-module-cache-path', str(work / 'swift-cache'), str(work / 'main.swift'), '-o', str(work / 'swift-test')], check=True)
    subprocess.run([str(work / 'swift-test')], check=True)
    java = (root / 'android/app/src/main/java/com/earvana/tinnitusrelief/PlaybackUsage.java').read_text()
    java = java.replace('private static double now() { return System.nanoTime() / 1e9; }', 'static double testTime; private static double now() { return testTime; }')
    (work / 'PlaybackUsage.java').write_text(java)
    (work / 'UsageTest.java').write_text('''package com.earvana.tinnitusrelief;
class UsageTest {
 static void check(String track, double expected) {
  if (Math.abs(PlaybackUsage.snapshot().getOrDefault(track, 0.0) - expected) > 0.000001) throw new AssertionError(track);
 }
 public static void main(String[] args) {
  Object a = new Object(), b = new Object(), duplicate = new Object();
  PlaybackUsage.begin(a, "ocean_high_tide_beach"); PlaybackUsage.testTime = 10;
  check("ocean_high_tide_beach", 10);
  PlaybackUsage.begin(duplicate, "ocean_high_tide_beach"); PlaybackUsage.begin(b, "forest");
  PlaybackUsage.tail(a, 2.25); PlaybackUsage.tail(duplicate, 2.25); PlaybackUsage.testTime = 15;
  check("ocean_high_tide_beach", 12.25); check("forest", 5);
  PlaybackUsage.suspend(b, true); PlaybackUsage.testTime = 20; check("forest", 5);
  PlaybackUsage.suspend(b, false); PlaybackUsage.testTime = 25; check("forest", 10);
  PlaybackUsage.interrupt(); PlaybackUsage.testTime = 30;
  PlaybackUsage.suspend(b, false); check("forest", 10); // decode recovery cannot override focus loss
  PlaybackUsage.end(b); PlaybackUsage.begin(b, "forest"); PlaybackUsage.testTime = 35; check("forest", 15);
  PlaybackUsage.end(b); PlaybackUsage.testTime = 100; check("forest", 15);
  System.out.println("PASS Java: process ledger, union, overlap/tails, starvation, focus-loss latch, replay, stop");
 }
}''')
    jdk = Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin')
    subprocess.run([str(jdk / 'javac'), '-d', str(work), str(work / 'PlaybackUsage.java'), str(work / 'UsageTest.java')], check=True)
    subprocess.run([str(jdk / 'java'), '-cp', str(work), 'com.earvana.tinnitusrelief.UsageTest'], check=True)

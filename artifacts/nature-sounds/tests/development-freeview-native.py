"""Stage 2 native policy + actual PCMPlayer control-path tests with a fake clock/Handler.
No audio device, app build or dependency installation. Run from repository root.
"""
from pathlib import Path
import subprocess
import tempfile
root = Path(__file__).resolve().parents[1]
jdk = Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin')
android_jar = Path('/Users/macstudio1/Library/Android/sdk/platforms/android-36/android.jar')
with tempfile.TemporaryDirectory(prefix='earphoria-stage2-tests-') as directory:
    work = Path(directory)
    ios = root / 'ios/App/CapApp-SPM/Sources/CapApp-SPM'
    usage = (ios / 'PlaybackUsage.swift').read_text().replace('private var now: Double { ProcessInfo.processInfo.systemUptime }', 'static var testTime: Double = 0\n    private var now: Double { Self.testTime }')
    policy = (ios / 'DevelopmentFreeview.swift').read_text()
    harness = '''
let policy = DevelopmentFreeview.shared, usage = PlaybackUsage.shared
precondition(!policy.enabled)
policy.configure(true)
if policy.available {
 let active = UUID(), outgoing = UUID(), replacement = UUID()
 usage.begin(active, track: "ocean_high_tide_beach")
 PlaybackUsage.testTime = 59.8
 precondition(!policy.reject("ocean_high_tide_beach"))
 usage.tail(active, seconds: 0.75)
 PlaybackUsage.testTime = 60.0; policy.tick()
 precondition(policy.reject("ocean_high_tide_beach"))
 usage.begin(outgoing, track: "forest")
 PlaybackUsage.testTime = 119.5
 usage.tail(outgoing, seconds: 2.25)
 usage.begin(replacement, track: "rain")
 PlaybackUsage.testTime = 120.0; policy.tick()
 precondition(policy.reject("forest")); precondition(!policy.reject("rain"))
 usage.interrupt(); PlaybackUsage.testTime = 150.0
 precondition(!policy.reject("rain"))
 usage.interruptionEnded(); usage.resume(replacement)
 PlaybackUsage.testTime = 209.5
 precondition(policy.reject("rain"))
 policy.subscribed = { true }; precondition(!policy.reject("rain"))
 policy.subscribed = { false }; precondition(policy.reject("rain"))
 precondition(DevelopmentFreeview.envelopeLevel(elapsed: 0) == 1)
 precondition(DevelopmentFreeview.envelopeLevel(elapsed: 0.5) == 0.5)
 precondition(DevelopmentFreeview.envelopeLevel(elapsed: 1.000) == 0)
 policy.configure(false); precondition(!policy.reject("rain"))
 print("PASS Swift DEBUG: latch/tails, separate tracks, interruption, bypass, independent 1s curve, default-off")
} else {
 precondition(!policy.enabled)
 print("PASS Swift non-DEBUG: enable request refused")
}
'''
    (work / 'main.swift').write_text(usage + policy + harness)
    for flags, name in [(['-D', 'DEBUG'], 'swift-debug'), ([], 'swift-default')]:
        subprocess.run(['swiftc', '-module-cache-path', '/private/tmp/earphoria-swift-module-cache', *flags, str(work / 'main.swift'), '-o', str(work / name)], check=True)
        subprocess.run([str(work / name)], check=True)
    java = root / 'android/app/src/main/java/com/earvana/tinnitusrelief'
    for name in ['PlaybackUsage', 'DevelopmentFreeview', 'PCMPlayer', 'AudioDecoder', 'BiquadFilter']:
        source = (java / (name + '.java')).read_text().replace('System.nanoTime()', 'TestClock.nanos')
        (work / (name + '.java')).write_text(source)
    (work / 'TestClock.java').write_text('package com.earvana.tinnitusrelief; public class TestClock { public static long nanos = 1000000000L; }')
    # Stub only scheduling/logging; compile PCMPlayer against installed Android API signatures.
    for name, source in {
        'Looper': 'package android.os; public class Looper { public static Looper getMainLooper(){return new Looper();} }',
        'Handler': '''package android.os;
import java.util.*; import com.earvana.tinnitusrelief.TestClock;
public class Handler {
 static Map<Runnable,Long> queued = new HashMap<>(); public Handler(Looper l) {}
 public boolean postDelayed(Runnable r,long delay){queued.put(r,TestClock.nanos+delay*1000000L);return true;}
 public void removeCallbacks(Runnable r){queued.remove(r);}
 public static void runDue(){for(var e:new HashMap<>(queued).entrySet()) if(e.getValue()<=TestClock.nanos){queued.remove(e.getKey());e.getKey().run();}}
}''',
    }.items():
        (work / (name + '.java')).write_text(source)
    (work / 'Log.java').write_text('package android.util; public class Log { public static int d(String t,String m){return 0;} public static int e(String t,String m){return 0;} public static int w(String t,String m,Throwable e){return 0;} }')
    (work / 'Stage2Test.java').write_text('''package com.earvana.tinnitusrelief;
import java.lang.reflect.*; import android.os.Handler;
public class Stage2Test {
 static Object field(PCMPlayer p,String name)throws Exception {Field f=PCMPlayer.class.getDeclaredField(name);f.setAccessible(true);return f.get(p);}
 static void set(PCMPlayer p,String name,Object value)throws Exception {Field f=PCMPlayer.class.getDeclaredField(name);f.setAccessible(true);f.set(p,value);}
 static PCMPlayer player(String track)throws Exception {
  AudioDecoder.DecodedAudio audio=new AudioDecoder.DecodedAudio(); audio.samples=new short[400];audio.sampleRate=100;audio.duration=2;audio.complete=true;audio.framesReady.set(200);
  PCMPlayer p=new PCMPlayer(audio,0,null,0.2f,0.5f,0.8f);p.observeTrack(track);set(p,"isPlaying",true);
  PlaybackUsage.begin(field(p,"usageID"),track);return p;
 }
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[] args)throws Exception {
  check(!DevelopmentFreeview.enabled()); DevelopmentFreeview.configure(false,true);check(!DevelopmentFreeview.enabled());
  DevelopmentFreeview.configure(true,true);
  PCMPlayer p=player("ocean_high_tide_beach"); TestClock.nanos+=60000000000L;
  check(DevelopmentFreeview.reject("ocean_high_tide_beach",false));check(!DevelopmentFreeview.reject("ocean_high_tide_beach",true));
  int[] completed={0}; p.observeFreeview(false,true,()->completed[0]++);
  check(DevelopmentFreeview.FADE_MILLISECONDS==1000);check(DevelopmentFreeview.envelopeLevel(0.5)==0.5f);check(DevelopmentFreeview.envelopeLevel(1)==0);
  TestClock.nanos+=999000000L;Handler.runDue();check(completed[0]==0);check(p.isPlaying());
  TestClock.nanos+=1000000L;Handler.runDue();check(completed[0]==1);check(!p.isPlaying());
  check((float)field(p,"fadeMultiplier")==1f);check((float)field(p,"timerFadeLevel")==1f);
  PCMPlayer paused=player("paused");paused.observeFreeview(false,true,()->completed[0]++);paused.pause(0.35f,null);
  TestClock.nanos+=1000000000L;Handler.runDue();check(completed[0]==1); // pause completion retains ownership
  PCMPlayer outgoing=player("outgoing");set(outgoing,"isPaused",true);outgoing.observeFreeview(false,true,()->completed[0]++);
  check((long)field(outgoing,"freeviewStartNanos")==0);
  PCMPlayer old=player("old"), newer=player("newer");old.observeFreeview(false,true,()->completed[0]++);old.stopImmediate();
  TestClock.nanos+=1000000000L;Handler.runDue();check(newer.isPlaying());check(completed[0]==1);
  PCMPlayer subscriber=player("subscriber");subscriber.observeFreeview(false,true,()->completed[0]++);subscriber.observeFreeview(true,true,null);
  TestClock.nanos+=1000000000L;Handler.runDue();check(subscriber.isPlaying());check(completed[0]==1);
  PCMPlayer justPurchased=player("justPurchased");boolean[] premium={false};
  justPurchased.setFreeviewAuthorization(()->!premium[0]);justPurchased.observeFreeview(false,true,()->completed[0]++);
  premium[0]=true;TestClock.nanos+=1000000000L;Handler.runDue();check(justPurchased.isPlaying());check(completed[0]==1);
  PCMPlayer sleep=player("sleep");sleep.startFadeOut(59);sleep.observeFreeview(false,true,()->completed[0]++);
  check((long)field(sleep,"freeviewStartNanos")==0); // existing sleep envelope untouched
  DevelopmentFreeview.configure(true,false);check(!DevelopmentFreeview.reject("ocean_high_tide_beach",false));
  System.out.println("PASS Java: DEBUG gate, exhaustion, 1s PCM completion, pause/switch/STOP precedence, stale replacement, subscriber bypass, sleep priority, legacy gains unchanged");
 }
}''')
    subprocess.run([str(jdk / 'javac'), '-cp', str(android_jar), '-d', str(work), *map(str, work.glob('*.java'))], check=True)
    subprocess.run([str(jdk / 'java'), '-cp', str(work) + ':' + str(android_jar), 'com.earvana.tinnitusrelief.Stage2Test'], check=True)

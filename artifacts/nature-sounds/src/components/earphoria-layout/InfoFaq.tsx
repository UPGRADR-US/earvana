import "./earphoria.css";

function Brand() {
  return <strong>earphoria<Tm /></strong>;
}

function Tm() {
  return <span className="info-tm">™</span>;
}

export function InfoFaq({ onClose }: { onClose?: () => void }) {
  return (
    <div className="timer-layer info-layer" data-testid="info-faq" onClick={onClose}>
      <div className="timer-backdrop" />
      <article className="eh-panel info-pane" onClick={(event) => event.stopPropagation()}>
        <button className="eh-close info-close-hitbox" onClick={onClose} data-testid="button-close-info" aria-label="Close information">✕</button>
        <div className="info-scroll">
          <h1>F.A.Q.</h1>

          <section>
            <h2>{"How can "}<Brand />{" help relieve my tinnitus ringing?"}</h2>
            <p>{"The "}<Brand />{" app bundles 4 benefits:"}</p>
            <ol style={{ listStyle: "none", paddingLeft: 4 }}>
              <li>{"1) Superior Masking"}</li>
              <li>{"2) Calm/relaxation with ultra-realistic nature recordings."}</li>
              <li>{"3) "}{"RingMatch"}<Tm />{" Lab: to help identify the frequency area of your ringing."}</li>
              <li>{"4) Notch Filter option: gives you the advanced ability to adjust your audio playback, i.e., “notch” your specific ringing frequency. This is an emerging experimental approach that has shown some success in helping to suppress "}<br />{"the tinnitus ringing.  Note: This is for your personal exploration, and not meant to replace a professional medical diagnosis."}</li>
            </ol>
            <h3>{"Masking:"}</h3>
            <p>{"The easiest and quickest way to get tinnitus relief is by ‘masking’, which is to apply an external sound to overshadow (mask) the internal ringing."}</p>
            <p>{"Traditional approaches often use WHITE NOISE, which is a sonic blast of all frequencies simultaneously. While this can be effective in tinnitus masking, the sound of white noise itself can increase stress and agitation, and especially at higher volumes can be an unpleasant sonic experience."}</p>
            <p>{"The "}<Brand />{" method aims to replace your internal ringing with audio that is not only pleasing to the ear, but calming to the mind;  the experience of being outdoors, in nature, while achieving the same tinnitus masking effect."}</p>
            <p>{"Note: Masking is best achieved when listening with ear buds/pods or headphones."}</p>
            <h3>{"Calming:"}</h3>
            <p>{"These are not normal nature recordings. The "}<Brand />{" audio soundscapes are composed/constructed and digitally mastered with an unprecedented spatial realism. The result is an audio ‘experience’ that so closely mimics the real thing, your brain may release the same neurotransmitters as if you are — actually — standing on the coastal rocks as the waves lap beneath you, or at the edge of a mountain spring. And at the same time, masking (and providing a diversion away from) the internal tinnitus ringing."}</p>
            <p>{"These tinnitus-relief soundscapes are selected and tailored for optimum tinnitus masking, with an added layer of specially-treated audio targeting the most common tinnitus frequency bands."}</p>
            <h3>{"The RingMatch Lab:"}</h3>
            <p>{"For your convenience, this on-board tool may help give you more information about your specific tinnitus frequency range. Here you can access any of 90 precise sine-wave frequencies, allowing you to explore, preview and possibly pinpoint your specific ringing pitch frequency."}</p>
            <p>{"NOTE: This is not meant to replace a proper diagnosis by a qualified medical professional, but it is provided for your exploration, experimentation, and understanding."}</p>
            <p>{"The Ring-Match tool can be invoked from the bottom control bar."}</p>
            <p>{"For best results:"}</p>
            <ul className="info-benefits-list">
              <li>{"listen with headphones (wired or wireless)"}</li>
              <li>{"go to the quietest possible environment, away from external noise."}</li>
              <li>{"start with a very low volume"}</li>
              <li>{"begin by auditioning the different frequency bands (upper-bass, lower-mid, midrange, upper-mid, etc)."}</li>
              <li>{"increase (or decrease) the volume only enough to match the volume of your internal ringing."}</li>
              <li>{"preview all the frequency bands and choose the one that most matches the ‘area’ (band) of your ringing."}</li>
              <li>{"click “EXPAND” to drill down further."}</li>
              <li>{"here you can drill-down and preview the sub-frequencies, listening closely for which one comes the closest to matching your ringing frequency."}</li>
              <li>{"TIP:  try shorter bursts (toggling each on/off), and notice that you may actually experience a momentary relief. Notice which specific frequency burst inspires the biggest temporary relief. This can be your starting point."}</li>
              <li>{"Chose “SELECT” for the one that gives you the most (temporary) relief."}</li>
              <li>{"This frequency will be retained within your app."}</li>
            </ul>
            <h3>{"The Notch Filter experimental tool:"}</h3>
            <p>{"Once you feel confident that you’ve pinpointed your dominant ringing frequency, you can opt to “notch” that frequency from the "}<Brand />{" playback. This is a developing research-informed approach that some people choose to explore. If you wish to experiment with this technique, the "}<Brand />{" notching tool is very convenient."}</p>
            <p>{"This approach involves listening to the notched-audio for an hour or more per day, for several weeks or more. Assuming the correct frequency band is selected, the targeted notch may coax the auditory complex to reorganize itself, training the brain’s emotional control centers to pay less attention to the ringing."}</p>
            <p>{"There is no guarantee of efficacy, however several articles and studies are available online, where you can learn more about this experimental process."}</p>
          </section>

          <section>
            <h2>{"What is the recommended playback speakers/settings?"}</h2>
            <p>{"The "}<Brand />{" soundscapes sound great on any playback system. If you are a tinnitus sufferer, you will find that using earbuds/airpods/headphones will provide the most effective experience. Noise cancellation FX (ANR) help further to minimize outside noise and distraction."}</p>
            <p>{"When playing through external speakers, the most immersive realism happens when your stereo speakers are physically separated; the wider the better."}</p>
            <p>{"NOTE: For the most natural "}<Brand />{" listening experience, it is recommended to disable any additional processing that may be present on your device. For example:"}</p>
            <ul className="info-plain-list info-red-list">
              <li>{"Mono playback"}</li>
              <li>{"Dolby Atmos"}</li>
              <li>{"Surround sound/effects"}</li>
              <li>{"Voice Isolation"}</li>
              <li>{"Stereo widening"}</li>
              <li>{"Theatre simulation"}</li>
            </ul>
            <p>{"While these software features can be helpful with certain types of media, it is recommended to disable them if you desire the full "}<Brand />{" experience. These soundscapes are very different. They are meticulously engineered for full sonic immersion, and therefore additional processing may hinder the intended experience."}</p>
            <p>{"TIP: There are several ways to get a surprisingly realistic soundscape - even from tiny phone speakers:"}</p>
            <ul className="info-benefits-list">
              <li>{"The closer the speakers are to your ears, the more immersive and effective."}</li>
              <li>{"When playing this directly from your smartphone, you will notice a big difference in the stereo field by simply rotating your phone 90 degrees to landscape mode."}</li>
              <li>{"Some users will simply lay their phone under their chin, (in landscape) or use a MagSafe phone protector with a lanyard (neck strap) to mount the phone in the same way. Additional benefits:  Hands-free immersive sound without resorting to in-ear buds. Also, having your phone away from ‘line-of-sight’ can help to minimize addictive phone distractions."}</li>
              <li>{"For side-sleepers that don’t wish to use earbuds, live speakers will likely work better. Some users have reported placing their phone - partially - underneath their pillow - with the bottom speaker slid underneath, (for more low-frequency resonance) and the top speaker sticking out beyond the pillow edge."}</li>
            </ul>
          </section>

          <section>
            <h2>{"Will this work over bluetooth wireless?"}</h2>
            <p>{"Yes. The soundscapes playback in both wired and wireless mode."}</p>
            <p>{"Connect your airpods or wireless buds/phones before pressing play.  audio routes automatically through your device’s active output."}</p>
          </section>

          <section>
            <h2>{"My ringing is a constant high-pitch squeal. Which soundscapes will work best?"}</h2>
            <p>{"The short answer: all of them can be effective."}</p>
            <p>{"If your tinnitus is in the high-frequency range (the most common), the ocean, rain, streams and winds are a great fit because they naturally carry sound energy at those frequencies.  Also the sound of crickets carry specific high frequencies that can be effective."}</p>
            <p>{"The best advice is to go through all the categories and soundscapes and note which ones serve you the best."}</p>
          </section>

          <section>
            <h2>{"How do I set the timer?"}</h2>
            <p>{"Tap the duration bar at the bottom of the screen to select 1-10 hours, or tap the infinite loop (∞)  icon at the far right for continuous playback. A countdown timer appears above the bar while a track is playing."}</p>
          </section>

          <section>
            <h2>{"I press PLAY, the button turns green, but i don’t hear any audio."}</h2>
            <p>{"All devices are different, and sometimes it can be a challenge to get audio to the right place."}</p>
            <ol style={{ listStyle: "none", paddingLeft: 4 }}>
              <li>{"1) Stop the playback, and then start again."}</li>
              <li>{"2) On the bottom of the screen, make sure the LED volume slider is up (showing green LEDs)."}</li>
              <li>{"3) Make sure your device’s physical volume is up (i.e., on the side edge of your device)."}</li>
              <li>{"4) It’s possible that your device’s audio output is pointing somewhere other than your desired playback speaker. i.e., to a different nearby bluetooth speaker or device.  To change this, stop playback and manage your output routing through your device’s settings pages.  Then restart the playback."}</li>
              <li>{"5) When all else fails, quit the app and relaunch."}</li>
            </ol>
          </section>

          <section>
            <h2>{"Can I play this through my TV system?"}</h2>
            <p>{"Yes. The method depends on your device’s settings as well as your TV setup. "}<br />{"In general, the following may help:"}<br />{"1) on iOS, (iPhone/iPad):  use AirPlay (control center) to stream to an Apple TV or compatible soundbar."}<br />{"2) on Android:  use Chromecast or bluetooth to your TV’s audio system."}</p>
          </section>

          <section>
            <h2>{"How can I cancel my subscription?"}</h2>
            <p>{"Go to Settings → your name → Subscriptions on iPhone/iPad, or Google Play → Account → Subscriptions on Android. Find “Tinnitus Relief” and tap Cancel. Access continues through the end of your current billing period."}</p>
          </section>

          <section>
            <h2>{"Will there be new tracks added in the future?"}</h2>
            <p>{"Yes — new categories and soundscapes are in production and will be delivered automatically to subscribers at no additional charge."}</p>
          </section>
        </div>
      </article>
    </div>
  );
}

export default InfoFaq;
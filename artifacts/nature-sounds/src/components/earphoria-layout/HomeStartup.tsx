import { useEffect, useState } from 'react';
import { prepareHomeArtwork } from '../../lib/homeArtworkReadiness';
import UpdatedHome from './UpdatedHome';

/** Gate only the visible homepage; the existing audio/state host is its sibling. */
export default function HomeStartup() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let cancelled = false;
    void prepareHomeArtwork().then(
      () => { if (!cancelled) setState('ready'); },
      () => { if (!cancelled) setState('error'); },
    );
    return () => { cancelled = true; };
  }, [attempt]);
  if (state === 'ready') return <UpdatedHome />;
  return <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', background: '#070e0c', color: '#e8f0dc', fontFamily: 'Figtree, sans-serif', padding: '24px', textAlign: 'center' }} aria-busy={state === 'loading'}>
    {state === 'error' ? <div>
      <p role="alert">Earphoria’s artwork could not load. Please try again.</p>
      <button onClick={() => { setState('loading'); setAttempt(value => value + 1); }} style={{ padding: '12px 24px', color: '#070e0c', background: '#e8f0dc', borderRadius: '6px', border: 0 }}>Retry</button>
    </div> : <p role="status">Loading Earphoria…</p>}
  </div>;
}

// Orchestrates the three phases the brief asks for:
//   intro (explain the page) → click → tornado (spinning load) → app (ask UI).

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import IntroExplainer from './components/IntroExplainer';
import TornadoLoader from './components/TornadoLoader';
import HowToVisualCanvas from './components/HowToVisualCanvas';

type Phase = 'intro' | 'loading' | 'app';

export default function App() {
  const [phase, setPhase] = useState<Phase>('intro');

  return (
    <AnimatePresence mode="wait">
      {phase === 'intro' && (
        <motion.div key="intro" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.4 }}>
          <IntroExplainer onEnter={() => setPhase('loading')} />
        </motion.div>
      )}

      {phase === 'loading' && (
        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <TornadoLoader onDone={() => setPhase('app')} ms={2200} />
        </motion.div>
      )}

      {phase === 'app' && (
        <motion.div key="app" initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <HowToVisualCanvas />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

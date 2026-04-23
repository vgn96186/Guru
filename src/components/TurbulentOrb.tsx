import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';
import LinearText from './primitives/LinearText';

interface Props {
  message?: string;
  size?: number;
}

const INTRO_END_FRAME = 90;
const FINAL_FRAME = 180;

const MESSAGE_VARIATIONS: Record<string, string[]> = {
  'Guru is planning your session...': [
    'Analyzing your weak topics...',
    'Selecting optimal content...',
    'Building your study agenda...',
    'Curating medical knowledge...',
  ],
  'Fetching content...': [
    'Consulting medical knowledge base...',
    'Generating study material...',
    'Preparing your next card...',
    "You're crushing this study session! 💪",
  ],
  'Loading your progress...': [
    'Syncing your study data...',
    'Calculating streak status...',
    'Tracking your medical mastery...',
  ],
  'Loading...': [
    'Thinking...',
    'Processing...',
    'Almost there...',
    'Brain loading...',
    'Stay focused...',
    'You got this, Doctor! 👨‍⚕️',
  ],
  'Guru is waking up...': ['Brewing coffee...', 'Connecting synapses...', 'Booting up...'],
};

const BLOB_LOTTIE = {
  v: '5.7.4',
  fr: 60,
  ip: 0,
  op: 180,
  w: 180,
  h: 180,
  nm: 'GuruBlob',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Glow',
      sr: 1,
      ks: {
        o: { a: 0, k: 45 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [90, 90, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [112, 112, 100] },
            { t: 90, s: [124, 124, 100] },
            { t: 180, s: [112, 112, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [118, 118] }, nm: 'Glow Ellipse' },
            {
              ty: 'fl',
              c: { a: 0, k: [0.388, 0.4, 0.945, 1] },
              o: { a: 0, k: 100 },
              r: 1,
              nm: 'Glow Fill',
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
          ],
          nm: 'Glow Group',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: 'Blob Back',
      sr: 1,
      ks: {
        o: { a: 0, k: 72 },
        r: {
          a: 1,
          k: [
            { t: 0, s: [-12] },
            { t: 90, s: [12] },
            { t: 180, s: [-12] },
          ],
        },
        p: {
          a: 1,
          k: [
            { t: 0, s: [90, 92, 0] },
            { t: 45, s: [83, 98, 0] },
            { t: 90, s: [97, 84, 0] },
            { t: 135, s: [100, 95, 0] },
            { t: 180, s: [90, 92, 0] },
          ],
        },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [96, 86, 100] },
            { t: 60, s: [104, 90, 100] },
            { t: 120, s: [92, 100, 100] },
            { t: 180, s: [96, 86, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [96, 84] }, nm: 'Blob Back Ellipse' },
            {
              ty: 'fl',
              c: { a: 0, k: [0.184, 0.231, 0.675, 1] },
              o: { a: 0, k: 100 },
              r: 1,
              nm: 'Blob Back Fill',
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
          ],
          nm: 'Blob Back Group',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 3,
      ty: 4,
      nm: 'Blob Front',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: {
          a: 1,
          k: [
            { t: 0, s: [8] },
            { t: 90, s: [-10] },
            { t: 180, s: [8] },
          ],
        },
        p: {
          a: 1,
          k: [
            { t: 0, s: [91, 87, 0] },
            { t: 45, s: [100, 81, 0] },
            { t: 90, s: [84, 95, 0] },
            { t: 135, s: [95, 100, 0] },
            { t: 180, s: [91, 87, 0] },
          ],
        },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [92, 104, 100] },
            { t: 60, s: [100, 92, 100] },
            { t: 120, s: [108, 98, 100] },
            { t: 180, s: [92, 104, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [92, 98] }, nm: 'Blob Front Ellipse' },
            {
              ty: 'fl',
              c: { a: 0, k: [0.506, 0.549, 0.973, 1] },
              o: { a: 0, k: 100 },
              r: 1,
              nm: 'Blob Front Fill',
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
          ],
          nm: 'Blob Front Group',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 4,
      ty: 4,
      nm: 'Highlight',
      sr: 1,
      ks: {
        o: { a: 0, k: 72 },
        r: { a: 0, k: -18 },
        p: {
          a: 1,
          k: [
            { t: 0, s: [63, 63, 0] },
            { t: 90, s: [70, 56, 0] },
            { t: 180, s: [63, 63, 0] },
          ],
        },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [88, 88, 100] },
            { t: 90, s: [96, 96, 100] },
            { t: 180, s: [88, 88, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [34, 22] }, nm: 'Highlight Ellipse' },
            {
              ty: 'fl',
              c: { a: 0, k: [1, 1, 1, 1] },
              o: { a: 0, k: 100 },
              r: 1,
              nm: 'Highlight Fill',
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } },
          ],
          nm: 'Highlight Group',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
  ],
};

function getRandomVariation(message: string): string {
  const variations = MESSAGE_VARIATIONS[message];
  if (!variations) return message;
  return variations[Math.floor(Math.random() * variations.length)];
}

export default React.memo(function TurbulentOrb({
  message = 'Hey there! Let me think...',
  size = 180,
}: Props) {
  const [displayMessage, setDisplayMessage] = React.useState(message);
  const [phase, setPhase] = React.useState<'intro' | 'smooth'>('intro');
  const [isAnimationLoaded, setIsAnimationLoaded] = React.useState(false);
  const lastMessageRef = useRef(message);
  const animationRef = useRef<LottieView>(null);

  useEffect(() => {
    if (lastMessageRef.current !== message) {
      lastMessageRef.current = message;
      queueMicrotask(() => setDisplayMessage(getRandomVariation(message)));
    }
    const interval = setInterval(() => setDisplayMessage(getRandomVariation(message)), 3000);
    return () => clearInterval(interval);
  }, [message]);

  useEffect(() => {
    if (!isAnimationLoaded) return;

    if (phase === 'intro') {
      animationRef.current?.reset();
      animationRef.current?.play(0, INTRO_END_FRAME);
      return;
    }

    animationRef.current?.play(INTRO_END_FRAME, FINAL_FRAME);
  }, [isAnimationLoaded, phase]);

  return (
    <View style={styles.container}>
      <View style={[styles.orbWrapper, { width: size, height: size }]}>
        <LottieView
          autoPlay={false}
          loop={false}
          ref={animationRef}
          resizeMode="contain"
          source={BLOB_LOTTIE}
          style={StyleSheet.absoluteFill}
          testID="loading-orb-lottie"
          onAnimationLoaded={() => setIsAnimationLoaded(true)}
          onAnimationFinish={(isCancelled) => {
            if (isCancelled) return;

            if (phase === 'intro') {
              setPhase('smooth');
              return;
            }

            animationRef.current?.play(INTRO_END_FRAME, FINAL_FRAME);
          }}
        />
      </View>
      {displayMessage ? (
        <View style={styles.messageWrap}>
          <LinearText variant="caption" tone="muted" centered style={styles.messageText}>
            {displayMessage}
          </LinearText>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  orbWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  messageWrap: {
    marginTop: 24,
    paddingHorizontal: 16,
    minHeight: 40,
    justifyContent: 'flex-start',
  },
  messageText: {
    letterSpacing: 0.5,
  },
});

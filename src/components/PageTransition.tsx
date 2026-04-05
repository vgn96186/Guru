import React from 'react';
import ScreenMotion, { type ScreenMotionProps } from '../motion/ScreenMotion';

/**
 * Backwards-compatible screen wrapper.
 * Delegate to the shared motion primitive so old imports do not drift.
 */
export default function PageTransition(props: ScreenMotionProps): React.ReactElement {
  return <ScreenMotion {...props} />;
}

export type { ScreenMotionProps };

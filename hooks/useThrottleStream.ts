
import { useState, useEffect, useRef } from 'react';

/**
 * Batches incoming LLM tokens and flushes them to the state at a maximum frequency.
 * Prevents React from choking during high-speed streaming.
 */
export function useThrottleStream(rawContent: string, fps: number = 15) {
  const [throttledContent, setThrottledContent] = useState(rawContent);
  const lastFlushTime = useRef(Date.now());
  const pendingContent = useRef(rawContent);
  const frameDuration = 1000 / fps;

  useEffect(() => {
    pendingContent.current = rawContent;
    const now = Date.now();
    const timeSinceLastFlush = now - lastFlushTime.current;

    if (timeSinceLastFlush >= frameDuration) {
      setThrottledContent(rawContent);
      lastFlushTime.current = now;
    } else {
      const timeout = setTimeout(() => {
        setThrottledContent(pendingContent.current);
        lastFlushTime.current = Date.now();
      }, frameDuration - timeSinceLastFlush);
      return () => clearTimeout(timeout);
    }
  }, [rawContent, frameDuration]);

  return throttledContent;
}

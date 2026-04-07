/**
 * Hook for optimized mobile touch gestures
 * Provides throttling, gesture detection, and velocity calculations
 * Ensures smooth 60fps mobile experience on low-end devices
 */

import { useRef, useCallback } from 'react';

export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface GestureState {
  isTouch: boolean;
  startPoint: TouchPoint | null;
  currentPoint: TouchPoint | null;
  velocity: { x: number; y: number };
  distance: { x: number; y: number };
  duration: number;
  direction: 'up' | 'down' | 'left' | 'right' | 'none';
}

interface UseTouchGestureOptions {
  onSwipe?: (direction: 'up' | 'down' | 'left' | 'right', velocity: number) => void;
  onLongPress?: (point: TouchPoint) => void;
  onPinch?: (scale: number, centerPoint: TouchPoint) => void;
  onDrag?: (point: TouchPoint, velocity: { x: number; y: number }) => void;
  minSwipeDistance?: number; // Default: 50px
  minSwipeVelocity?: number; // Default: 0.5 px/ms
  longPressDuration?: number; // Default: 500ms
  throttleMs?: number; // Default: 16ms (60fps)
}

/**
 * Main hook: Handles all touch gestures with optimization
 */
export const useTouchGesture = ({
  onSwipe,
  onLongPress,
  onPinch,
  onDrag,
  minSwipeDistance = 50,
  minSwipeVelocity = 0.5,
  longPressDuration = 500,
  throttleMs = 16, // 60fps throttling
}: UseTouchGestureOptions = {}) => {
  const gestureState = useRef<GestureState>({
    isTouch: false,
    startPoint: null,
    currentPoint: null,
    velocity: { x: 0, y: 0 },
    distance: { x: 0, y: 0 },
    duration: 0,
    direction: 'none',
  });

  const longPressTimeoutRef = useRef<number | undefined>(undefined);
  const throttleTimeoutRef = useRef<number | undefined>(undefined);
  const lastThrottleTimeRef = useRef<number>(0);

  /**
   * Detect swipe direction based on distance
   */
  const detectDirection = (
    dx: number,
    dy: number
  ): 'up' | 'down' | 'left' | 'right' | 'none' => {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < minSwipeDistance && absDy < minSwipeDistance) return 'none';

    if (absDx > absDy) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  };

  /**
   * Calculate velocity in px/ms
   */
  const calculateVelocity = (distance: number, duration: number): number => {
    return duration > 0 ? distance / duration : 0;
  };

  /**
   * Throttled touch move handler - called max once per 16ms
   */
  const throttledTouchMove = useCallback(
    (clientX: number, clientY: number, timestamp: number) => {
      const now = Date.now();
      const timeSinceLastThrottle = now - lastThrottleTimeRef.current;

      if (timeSinceLastThrottle < throttleMs) {
        // Clear pending throttle and schedule new one
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current);
        }
        throttleTimeoutRef.current = window.setTimeout(() => {
          throttledTouchMove(clientX, clientY, timestamp);
        }, throttleMs - timeSinceLastThrottle);
        return;
      }

      lastThrottleTimeRef.current = now;
      const state = gestureState.current;

      if (!state.startPoint) return;

      // Calculate displacement
      const dx = clientX - state.startPoint.x;
      const dy = clientY - state.startPoint.y;
      const duration = timestamp - state.startPoint.timestamp;

      // Update gesture state
      state.currentPoint = { x: clientX, y: clientY, timestamp };
      state.distance = { x: dx, y: dy };
      state.duration = duration;
      state.direction = detectDirection(dx, dy);
      state.velocity = {
        x: calculateVelocity(dx, duration),
        y: calculateVelocity(dy, duration),
      };

      // Fire drag callback
      if (onDrag && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        onDrag(state.currentPoint, state.velocity);
      }
    },
    [onDrag, throttleMs, minSwipeDistance]
  );

  /**
   * Handle touch start
   */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement> | TouchEvent) => {
      const touches = 'touches' in e ? e.touches : (e as any).touches;
      if (!touches || touches.length === 0) return;

      const state = gestureState.current;
      const touch = touches[0];

      state.isTouch = true;
      state.startPoint = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };
      state.currentPoint = { ...state.startPoint };
      state.distance = { x: 0, y: 0 };
      state.duration = 0;
      state.direction = 'none';

      // Clear previous long press
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }

      // Set long press timeout
      if (onLongPress) {
        longPressTimeoutRef.current = window.setTimeout(() => {
          if (state.isTouch && state.startPoint) {
            onLongPress(state.startPoint);
          }
        }, longPressDuration);
      }
    },
    [onLongPress, longPressDuration]
  );

  /**
   * Handle touch move with throttling
   */
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement> | TouchEvent) => {
      const touches = 'touches' in e ? e.touches : (e as any).touches;
      if (!touches || touches.length === 0) return;

      const state = gestureState.current;
      if (!state.isTouch) return;

      // Handle pinch gesture (2 fingers)
      if (touches.length > 1 && onPinch) {
        const touch1 = touches[0];
        const touch2 = touches[1];
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const centerPoint = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2,
          timestamp: Date.now(),
        };

        // Calculate scale change (roughly)
        const previousDistance = state.distance.x;
        const scaleChange = previousDistance > 0 ? distance / previousDistance : 1;
        onPinch(scaleChange, centerPoint);
        return;
      }

      // Single touch move
      const touch = touches[0];
      throttledTouchMove(touch.clientX, touch.clientY, Date.now());

      // Cancel long press on significant movement
      if (Math.abs(state.distance.x) > 10 || Math.abs(state.distance.y) > 10) {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
        }
      }
    },
    [throttledTouchMove, onPinch]
  );

  /**
   * Handle touch end - fire swipe event
   */
  const handleTouchEnd = useCallback(() => {
    const state = gestureState.current;
    state.isTouch = false;

    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }

    if (!state.startPoint || !state.currentPoint) return;

    const { distance, direction, velocity } = state;
    const maxVelocity = Math.max(
      Math.abs(velocity.x),
      Math.abs(velocity.y)
    );

    // Only fire swipe if minimum distance and velocity thresholds met
    if (
      Math.abs(distance.x) > minSwipeDistance ||
      Math.abs(distance.y) > minSwipeDistance
    ) {
      if (maxVelocity >= minSwipeVelocity && onSwipe && direction !== 'none') {
        onSwipe(direction, maxVelocity);
      }
    }

    // Reset gesture state
    state.startPoint = null;
    state.currentPoint = null;
    state.distance = { x: 0, y: 0 };
    state.duration = 0;
    state.direction = 'none';
  }, [minSwipeDistance, minSwipeVelocity, onSwipe]);

  /**
   * Cleanup on unmount
   */
  const cleanup = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
    }
  }, []);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    cleanup,
    gestureState: gestureState.current,
  };
};

/**
 * Hook for single swipe detection (simplified version)
 */
export const useSwipe = (
  onSwipe: (direction: 'up' | 'down' | 'left' | 'right') => void,
  minDistance = 50
) => {
  return useTouchGesture({
    onSwipe: (direction) => onSwipe(direction),
    minSwipeDistance: minDistance,
  });
};

/**
 * Hook for drag/pan detection
 */
export const useDrag = (
  onDragMove: (point: TouchPoint, velocity: { x: number; y: number }) => void
) => {
  return useTouchGesture({
    onDrag: onDragMove,
  });
};

/**
 * Hook for long press detection
 */
export const useLongPress = (
  onPress: (point: TouchPoint) => void,
  duration = 500
) => {
  return useTouchGesture({
    onLongPress: onPress,
    longPressDuration: duration,
  });
};

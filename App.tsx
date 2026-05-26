import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const KEEP_AWAKE_TAG = 'teleprompter-timer-running';

const PRESETS = [
  { label: '15s', seconds: 15 },
  { label: '30s', seconds: 30 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2m', seconds: 120 },
  { label: '3m', seconds: 180 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
];

const CUSTOM_STEP_SECONDS = 15;
const DEFAULT_SECONDS = 60;

type TimerMode = 'idle' | 'running' | 'paused' | 'finished';

type Phase = {
  name: string;
  background: string;
  accent: string;
  label: string;
};

function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getPhase(remainingSeconds: number, selectedSeconds: number, mode: TimerMode): Phase {
  if (mode === 'finished' || remainingSeconds <= 0) {
    return {
      name: 'red',
      background: '#2b0508',
      accent: '#ff445f',
      label: 'Finish now',
    };
  }

  const progressLeft = remainingSeconds / selectedSeconds;

  if (progressLeft <= 0.15) {
    return {
      name: 'red',
      background: '#2b0508',
      accent: '#ff445f',
      label: 'Final stretch',
    };
  }

  if (progressLeft <= 0.35) {
    return {
      name: 'amber',
      background: '#2b1a03',
      accent: '#ffb020',
      label: 'Start wrapping up',
    };
  }

  return {
    name: 'green',
    background: '#031d14',
    accent: '#31d07f',
    label: 'On time',
  };
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [selectedSeconds, setSelectedSeconds] = useState(DEFAULT_SECONDS);
  const [remainingMs, setRemainingMs] = useState(DEFAULT_SECONDS * 1000);
  const [mode, setMode] = useState<TimerMode>('idle');
  const [overtimeMs, setOvertimeMs] = useState(0);
  const endAtRef = useRef<number | null>(null);
  const overtimeStartedAtRef = useRef<number | null>(null);

  const remainingSeconds = remainingMs / 1000;
  const phase = useMemo(
    () => getPhase(remainingSeconds, selectedSeconds, mode),
    [mode, remainingSeconds, selectedSeconds]
  );

  const displayTime = mode === 'finished' ? `+${formatTime(overtimeMs / 1000)}` : formatTime(remainingSeconds);

  useEffect(() => {
    if (mode === 'running') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
      };
    }

    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    return undefined;
  }, [mode]);

  useEffect(() => {
    if (mode !== 'running') {
      return undefined;
    }

    const interval = setInterval(() => {
      if (!endAtRef.current) {
        return;
      }

      const nextRemaining = Math.max(0, endAtRef.current - Date.now());
      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        overtimeStartedAtRef.current = Date.now();
        setOvertimeMs(0);
        setMode('finished');
      }
    }, 100);

    return () => clearInterval(interval);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'finished') {
      return undefined;
    }

    const interval = setInterval(() => {
      if (overtimeStartedAtRef.current) {
        setOvertimeMs(Date.now() - overtimeStartedAtRef.current);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [mode]);

  function choosePreset(seconds: number) {
    setSelectedSeconds(seconds);
    setRemainingMs(seconds * 1000);
    setOvertimeMs(0);
    endAtRef.current = null;
    overtimeStartedAtRef.current = null;
    setMode('idle');
  }

  function changeCustomDuration(direction: 1 | -1) {
    const nextSeconds = Math.max(CUSTOM_STEP_SECONDS, selectedSeconds + direction * CUSTOM_STEP_SECONDS);
    choosePreset(nextSeconds);
  }

  function startOrResume() {
    const nextRemaining = remainingMs > 0 ? remainingMs : selectedSeconds * 1000;
    setRemainingMs(nextRemaining);
    setOvertimeMs(0);
    overtimeStartedAtRef.current = null;
    endAtRef.current = Date.now() + nextRemaining;
    setMode('running');
  }

  function pause() {
    if (mode !== 'running') {
      return;
    }

    endAtRef.current = null;
    setMode('paused');
  }

  function reset() {
    setRemainingMs(selectedSeconds * 1000);
    setOvertimeMs(0);
    endAtRef.current = null;
    overtimeStartedAtRef.current = null;
    setMode('idle');
  }

  function handleMainTap() {
    if (mode === 'running') {
      pause();
      return;
    }

    if (mode === 'idle' || mode === 'paused') {
      startOrResume();
    }
  }

  const primaryActionLabel = mode === 'running' ? 'Pause' : mode === 'finished' ? 'Run again' : 'Start';
  const timerSize = isLandscape ? Math.min(width * 0.28, 190) : Math.min(width * 0.34, 152);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: phase.background }]}>
      <StatusBar hidden />
      <ScrollView contentContainerStyle={[styles.screen, isLandscape && styles.screenLandscape]}>
        <View style={[styles.header, isLandscape && styles.headerLandscape]}>
          <View>
            <Text style={styles.appLabel}>Teleprompter Timer</Text>
            <Text style={styles.setupLabel}>iPad script · iPhone countdown</Text>
          </View>
          <View style={[styles.phasePill, { borderColor: phase.accent }]}>
            <Text style={[styles.phaseText, { color: phase.accent }]}>{phase.label}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap to start, pause, or resume the timer"
          onPress={handleMainTap}
          style={[styles.timerCard, { borderColor: phase.accent }]}
        >
          <Text style={[styles.timerText, { color: phase.accent, fontSize: timerSize }]}>{displayTime}</Text>
          <Text style={styles.timerHint}>
            {mode === 'running'
              ? 'Tap anywhere on the timer to pause'
              : mode === 'paused'
                ? 'Paused · tap timer to resume'
                : mode === 'finished'
                  ? 'Overtime · reset or run again'
                  : 'Tap timer or Start when ready'}
          </Text>
        </Pressable>

        <View style={styles.controlsRow}>
          <Pressable style={[styles.controlButton, styles.secondaryButton]} onPress={reset}>
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </Pressable>
          <Pressable
            style={[styles.controlButton, styles.primaryButton, { backgroundColor: phase.accent }]}
            onPress={mode === 'running' ? pause : startOrResume}
          >
            <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick presets</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((preset) => {
              const selected = preset.seconds === selectedSeconds;
              return (
                <Pressable
                  key={preset.seconds}
                  style={[styles.presetButton, selected && { borderColor: phase.accent, backgroundColor: '#18231f' }]}
                  onPress={() => choosePreset(preset.seconds)}
                >
                  <Text style={[styles.presetText, selected && { color: phase.accent }]}>{preset.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.customRow}>
          <Pressable style={styles.customButton} onPress={() => changeCustomDuration(-1)}>
            <Text style={styles.customButtonText}>−15s</Text>
          </Pressable>
          <Text style={styles.customDuration}>Target {formatTime(selectedSeconds)}</Text>
          <Pressable style={styles.customButton} onPress={() => changeCustomDuration(1)}>
            <Text style={styles.customButtonText}>+15s</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    gap: 22,
    justifyContent: 'space-between',
    padding: 22,
  },
  screenLandscape: {
    gap: 14,
    paddingHorizontal: 34,
    paddingVertical: 16,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerLandscape: {
    alignItems: 'center',
  },
  appLabel: {
    color: '#f4f7fb',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  setupLabel: {
    color: '#a8b1bd',
    fontSize: 13,
    marginTop: 4,
  },
  phasePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  phaseText: {
    fontSize: 14,
    fontWeight: '800',
  },
  timerCard: {
    alignItems: 'center',
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 230,
    paddingHorizontal: 16,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  timerText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: -5,
    lineHeight: 170,
  },
  timerHint: {
    color: '#c7d0da',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  controlButton: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
  },
  primaryButton: {
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
  },
  secondaryButton: {
    backgroundColor: '#17202b',
    borderColor: '#334155',
    borderWidth: 1,
  },
  primaryButtonText: {
    color: '#07110c',
    fontSize: 20,
    fontWeight: '900',
  },
  secondaryButtonText: {
    color: '#e6edf6',
    fontSize: 20,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#d8e0ea',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetButton: {
    alignItems: 'center',
    backgroundColor: '#111923',
    borderColor: '#2b3848',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  presetText: {
    color: '#f4f7fb',
    fontSize: 18,
    fontWeight: '800',
  },
  customRow: {
    alignItems: 'center',
    backgroundColor: '#101822',
    borderColor: '#223044',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 10,
  },
  customButton: {
    backgroundColor: '#1d2938',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  customButtonText: {
    color: '#edf4ff',
    fontSize: 17,
    fontWeight: '900',
  },
  customDuration: {
    color: '#dce6f1',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
});

import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../../src/db';
import { ANY_TIME, ScheduleStore, describeSchedule, inWindow, nextWindow, scheduleFromEnv, validateSchedule } from '../../src/schedule';

const at = (iso: string) => Date.parse(iso);

describe('update window', () => {
  test('validation', () => {
    expect(validateSchedule({ start: '02:00', end: '05:30', days: ['1', '5'], delayHours: '24' })).toEqual({ start: 120, end: 330, days: [1, 5], delayHours: 24 });
    expect(validateSchedule({ start: '', end: '', days: [], delayHours: '' })).toEqual(ANY_TIME);
    expect(validateSchedule({ start: '', end: '', days: ['0', '1', '2', '3', '4', '5', '6'] }).days).toEqual([]); // every day
    expect(() => validateSchedule({ start: '02:00', end: '' })).toThrow('the end of the window');
    expect(() => validateSchedule({ start: '25:00', end: '01:00' })).toThrow('a time such as 02:00');
    expect(() => validateSchedule({ start: '03:00', end: '03:00' })).toThrow('same time');
    expect(() => validateSchedule({ start: '02:00', end: '02:05' })).toThrow('at least 15 minutes');
    expect(validateSchedule({ start: '23:50', end: '00:10' })).toMatchObject({ start: 1430, end: 10 });
    expect(() => validateSchedule({ delayHours: '1.5' })).toThrow('whole number');
    expect(() => validateSchedule({ delayHours: '721' })).toThrow('0 to 720');
  });
  test('inside, outside, across midnight, and days', () => {
    const night = validateSchedule({ start: '02:00', end: '05:00' });
    expect(inWindow(night, at('2026-11-18T03:00:00Z'))).toBe(true);
    expect(inWindow(night, at('2026-11-18T05:00:00Z'))).toBe(false); // the end is not included
    expect(inWindow(night, at('2026-11-18T01:59:00Z'))).toBe(false);
    const late = validateSchedule({ start: '22:00', end: '04:00', days: ['5'] }); // Friday night
    expect(inWindow(late, at('2026-11-20T23:00:00Z'))).toBe(true); // Friday 23:00
    expect(inWindow(late, at('2026-11-21T03:00:00Z'))).toBe(true); // Saturday 03:00: Friday's window
    expect(inWindow(late, at('2026-11-21T23:00:00Z'))).toBe(false); // Saturday's own night
    expect(inWindow(late, at('2026-11-20T03:00:00Z'))).toBe(false); // Friday 03:00 is Thursday's
    const weekdays = validateSchedule({ days: ['1', '2', '3', '4', '5'] });
    expect(inWindow(weekdays, at('2026-11-22T12:00:00Z'))).toBe(false); // Sunday
    expect(inWindow(ANY_TIME, at('2026-11-22T12:00:00Z'))).toBe(true);
  });
  test('the next time in the window', () => {
    const night = validateSchedule({ start: '02:00', end: '05:00' });
    expect(new Date(nextWindow(night, at('2026-11-18T10:00:00Z'))).toISOString()).toBe('2026-11-19T02:00:00.000Z');
    expect(nextWindow(night, at('2026-11-18T03:00:00Z'))).toBe(at('2026-11-18T03:00:00Z'));
    const weekend = validateSchedule({ start: '22:00', end: '04:00', days: ['6'] });
    expect(new Date(nextWindow(weekend, at('2026-11-18T10:00:00Z'))).toISOString()).toBe('2026-11-21T22:00:00.000Z'); // Wednesday to Saturday night
    const sundays = validateSchedule({ days: ['0'] });
    expect(new Date(nextWindow(sundays, at('2026-11-18T10:00:00Z'))).toISOString()).toBe('2026-11-22T00:00:00.000Z');
  });
  test('described in words', () => {
    expect(describeSchedule(ANY_TIME)).toBe('at any time');
    expect(describeSchedule(validateSchedule({ start: '02:00', end: '05:00', days: ['6', '0'], delayHours: '24' }))).toBe('between 02:00 and 05:00 UTC on Sun, Sat, once a newer image has been seen for 24 hours');
  });
  test('from the environment', () => {
    expect(scheduleFromEnv('02:00-05:00 Mon,Fri', '12')).toEqual({ start: 120, end: 300, days: [1, 5], delayHours: 12 });
    expect(scheduleFromEnv(undefined, undefined)).toEqual(ANY_TIME);
    expect(() => scheduleFromEnv('2am-5am', undefined)).toThrow('KONTAINERS_AUTOUPDATE_WINDOW');
    expect(() => scheduleFromEnv('02:00-05:00 Funday', undefined)).toThrow('days are');
    expect(() => scheduleFromEnv('02:00-05:00 Monkey', undefined)).toThrow('days are');
    expect(scheduleFromEnv('02:00-05:00 Mon-Fri', undefined).days).toEqual([1, 2, 3, 4, 5]);
    expect(scheduleFromEnv('22:00-04:00 Fri-Mon', undefined).days).toEqual([0, 1, 5, 6]);
    expect(scheduleFromEnv('02:00-05:00 saturday sunday', undefined).days).toEqual([0, 6]);
  });
  test('stored: saved settings win over the environment; first sight of an image is remembered', () => {
    const db = new Database(':memory:', { strict: true }); migrate(db);
    let now = 1000;
    const st = new ScheduleStore(db, validateSchedule({ delayHours: '6' }), () => now);
    expect(st.get().delayHours).toBe(6);
    st.set(validateSchedule({ start: '01:00', end: '02:00' }));
    expect(st.get()).toMatchObject({ start: 60, end: 120, delayHours: 0 });
    expect(st.firstSeen('app:1', 'sha256:a')).toBe(1000);
    now = 5000;
    expect(st.firstSeen('app:1', 'sha256:a')).toBe(1000);
    expect(st.firstSeen('app:1', 'sha256:b')).toBe(5000);
  });
});

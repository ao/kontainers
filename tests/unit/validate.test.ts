import { describe, expect, test } from 'bun:test';
import * as v from '../../src/validate';

describe('ref', () => {
  test('accepts container IDs and names', () => {
    expect(v.ref('a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
    expect(v.ref('web_1.prod-2')).toBe('web_1.prod-2');
  });
  test.each(['--help', '-f', '../x', 'a/b', '', 'a b', 'x;rm -rf /', 'a\nb', '.hidden', '%2e%2e'])('rejects %p', bad => {
    expect(() => v.ref(bad)).toThrow(v.ValidationError);
  });
  test('rejects non-strings', () => {
    expect(() => v.ref(1)).toThrow();
    expect(() => v.ref(['a'])).toThrow();
    expect(() => v.ref({})).toThrow();
  });
});

describe('image', () => {
  test.each(['nginx', 'nginx:1.27-alpine', 'ghcr.io/org/app:v1', 'localhost:5000/a/b', 'alpine@sha256:' + 'a'.repeat(64)])('accepts %p', ok => {
    expect(v.image(ok)).toBe(ok);
  });
  test.each(['-v', '--privileged', 'Nginx', 'a b', 'a;b', '', 'a:', '../a', 'a/../b'])('rejects %p', bad => {
    expect(() => v.image(bad)).toThrow(v.ValidationError);
  });
  test('imageRef also takes image IDs', () => {
    expect(v.imageRef('sha256:' + 'b'.repeat(64))).toBe('sha256:' + 'b'.repeat(64));
    expect(() => v.imageRef('sha256:-x')).toThrow();
    expect(() => v.imageRef('--force')).toThrow();
  });
});

describe('hostname', () => {
  test('lowercases and accepts wildcards', () => {
    expect(v.hostname('App.Example.COM')).toBe('app.example.com');
    expect(v.hostname('*.example.com')).toBe('*.example.com');
  });
  test.each(['a.com\n', 'a.com;', 'a{b}.com', 'a .com', '-a.com', 'a-.com', 'a..com', '', 'a.com/x', 'a.com:80', 'x'.repeat(64) + '.com', '*.'])('rejects %p', bad => {
    expect(() => v.hostname(bad)).toThrow(v.ValidationError);
  });
});

describe('pathPrefix', () => {
  test('defaults to /', () => expect(v.pathPrefix('')).toBe('/'));
  test('accepts a prefix', () => expect(v.pathPrefix('/api/v1')).toBe('/api/v1'));
  test.each(['api', '/a b', '/a/../b', '/a;b', '/a{b', '/a\n', '/a?x=1', '/a#b'])('rejects %p', bad => {
    expect(() => v.pathPrefix(bad)).toThrow(v.ValidationError);
  });
});

describe('scalars', () => {
  test('port', () => {
    expect(v.port('80')).toBe(80);
    expect(v.port(65535)).toBe(65535);
    for (const bad of [0, 65536, '1e3', '-1', 'x', 1.5, '']) expect(() => v.port(bad)).toThrow();
  });
  test('envVar', () => {
    expect(v.envVar('A_B=c d=e')).toBe('A_B=c d=e');
    for (const bad of ['=x', '1A=x', 'A', 'A=x\ny', 'A=\0']) expect(() => v.envVar(bad)).toThrow();
  });
  test('hostIp defaults to loopback', () => {
    expect(v.hostIp(undefined)).toBe('127.0.0.1');
    expect(v.hostIp('0.0.0.0')).toBe('0.0.0.0');
    expect(() => v.hostIp('example.com')).toThrow();
  });
  test('username and password', () => {
    expect(v.username('admin')).toBe('admin');
    expect(() => v.username('a b')).toThrow();
    expect(() => v.username('x'.repeat(65))).toThrow();
    expect(() => v.password('short')).toThrow();
    expect(v.password('twelve chars')).toBe('twelve chars');
  });
  test('intInRange', () => {
    expect(v.intInRange(undefined, 1, 10, 5)).toBe(5);
    expect(v.intInRange('7', 1, 10, 5)).toBe(7);
    expect(() => v.intInRange('11', 1, 10, 5)).toThrow();
  });
});

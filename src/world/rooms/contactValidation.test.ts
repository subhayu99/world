// TDD: written before contactValidation.ts. Pure logic only — no DOM/canvas —
// so this stays fast and deterministic under happy-dom.

import { describe, expect, it } from 'vitest';
import {
  FIELD_CAPS,
  buildEndpointPayload,
  buildMailto,
  chooseSubmitMode,
  truncate,
  validateEmail,
  validateForm,
  type ContactFormFields,
} from './contactValidation';

describe('validateEmail', () => {
  it('accepts a simple valid address', () => {
    expect(validateEmail('a@b.com')).toBe(true);
  });

  it('accepts a realistic address with subdomain and plus tag', () => {
    expect(validateEmail('subhayu+portfolio@mail.example.co')).toBe(true);
  });

  it('rejects a missing @', () => {
    expect(validateEmail('a-at-b.com')).toBe(false);
  });

  it('rejects a missing domain dot', () => {
    expect(validateEmail('a@bcom')).toBe(false);
  });

  it('rejects an address containing whitespace', () => {
    expect(validateEmail('a b@c.com')).toBe(false);
    expect(validateEmail('a@ c.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateEmail('')).toBe(false);
  });

  it('rejects a second @ in the domain part', () => {
    expect(validateEmail('a@b@c.com')).toBe(false);
  });
});

describe('truncate', () => {
  it('returns the value unchanged when under the cap', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the value unchanged when exactly at the cap', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('cuts the value down to the cap when over it', () => {
    expect(truncate('hello world', 5)).toBe('hello');
  });

  it('handles a zero cap', () => {
    expect(truncate('hello', 0)).toBe('');
  });
});

describe('validateForm', () => {
  const valid: ContactFormFields = {
    email: 'subhayu@example.com',
    subject: 'Let’s collaborate',
    message: 'Saw your portfolio, would love to chat about a role.',
  };

  it('passes ok:true with no errors for fully valid input', () => {
    const result = validateForm(valid);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('flags all three fields as required when everything is empty', () => {
    const result = validateForm({ email: '', subject: '', message: '' });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.subject).toBeTruthy();
    expect(result.errors.message).toBeTruthy();
  });

  it('treats whitespace-only fields as empty (required, not just malformed)', () => {
    const result = validateForm({ email: '   ', subject: '  ', message: '   ' });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.subject).toBeTruthy();
    expect(result.errors.message).toBeTruthy();
  });

  it('flags an invalid email format distinctly from a missing one', () => {
    const result = validateForm({ ...valid, email: 'not-an-email' });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.subject).toBeUndefined();
    expect(result.errors.message).toBeUndefined();
  });

  it('flags an email over the 50-char cap', () => {
    const longEmail = `${'a'.repeat(45)}@b.com`; // 51 chars, still a *valid* shape
    expect(longEmail.length).toBeGreaterThan(FIELD_CAPS.email);
    const result = validateForm({ ...valid, email: longEmail });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBeTruthy();
  });

  it('flags a subject over the 50-char cap', () => {
    const result = validateForm({ ...valid, subject: 'x'.repeat(51) });
    expect(result.ok).toBe(false);
    expect(result.errors.subject).toBeTruthy();
  });

  it('accepts a subject exactly at the 50-char cap', () => {
    const result = validateForm({ ...valid, subject: 'x'.repeat(50) });
    expect(result.ok).toBe(true);
    expect(result.errors.subject).toBeUndefined();
  });

  it('flags a message over the 300-char cap', () => {
    const result = validateForm({ ...valid, message: 'x'.repeat(301) });
    expect(result.ok).toBe(false);
    expect(result.errors.message).toBeTruthy();
  });

  it('accepts a message exactly at the 300-char cap', () => {
    const result = validateForm({ ...valid, message: 'x'.repeat(300) });
    expect(result.ok).toBe(true);
    expect(result.errors.message).toBeUndefined();
  });

  it('reports independent errors per field rather than short-circuiting', () => {
    const result = validateForm({ email: 'bad', subject: '', message: 'y'.repeat(400) });
    expect(result.ok).toBe(false);
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.subject).toBeTruthy();
    expect(result.errors.message).toBeTruthy();
  });
});

describe('buildMailto', () => {
  it('builds a mailto: URL addressed to the given recipient', () => {
    const url = buildMailto('me@example.com', { email: 'a@b.com', subject: 'Hi', message: 'Hello' });
    expect(url.startsWith('mailto:me@example.com?')).toBe(true);
  });

  it('URL-encodes spaces and punctuation in the subject', () => {
    const url = buildMailto('me@example.com', { email: 'a@b.com', subject: 'Job: Data Engineer?', message: 'Hi' });
    expect(url).toContain('subject=Job%3A%20Data%20Engineer%3F');
  });

  it('prefixes the body with "From: <email>" followed by a blank line, then the message', () => {
    const url = buildMailto('me@example.com', { email: 'a@b.com', subject: 'Hi', message: 'Hello there' });
    const expectedBody = encodeURIComponent('From: a@b.com\n\nHello there');
    expect(url).toContain(`body=${expectedBody}`);
  });

  it('encodes newlines within a multi-line message', () => {
    const url = buildMailto('me@example.com', { email: 'a@b.com', subject: 'Hi', message: 'line one\nline two' });
    expect(url).toContain('%0Aline%20two');
  });

  it('never leaves a literal @ or space unencoded in the body', () => {
    const url = buildMailto('me@example.com', { email: 'a@b.com', subject: 'Hi', message: 'x' });
    const bodyParam = url.split('body=')[1] ?? '';
    expect(bodyParam).not.toContain('@');
    expect(bodyParam).not.toContain(' ');
  });
});

describe('chooseSubmitMode', () => {
  it('chooses mailto when endpoint is an empty string', () => {
    expect(chooseSubmitMode({ endpoint: '', accessKey: '', mailto: 'me@example.com' })).toBe('mailto');
  });

  it('chooses mailto when endpoint is whitespace-only', () => {
    expect(chooseSubmitMode({ endpoint: '   ', accessKey: '', mailto: 'me@example.com' })).toBe('mailto');
  });

  it('chooses endpoint when a non-empty endpoint URL is configured', () => {
    expect(
      chooseSubmitMode({ endpoint: 'https://api.web3forms.com/submit', accessKey: 'key', mailto: 'me@example.com' }),
    ).toBe('endpoint');
  });
});

describe('buildEndpointPayload', () => {
  it('shapes the JSON body with access_key, a fixed from_name, and the form fields', () => {
    const payload = buildEndpointPayload('secret-key', { email: 'a@b.com', subject: 'Hi', message: 'Hello' });
    expect(payload).toEqual({
      access_key: 'secret-key',
      from_name: 'Portfolio Contact',
      email: 'a@b.com',
      subject: 'Hi',
      message: 'Hello',
    });
  });
});

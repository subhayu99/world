// Pure logic for the Contact room's paper form: email/field validation,
// truncation, mailto: URL assembly, the endpoint-vs-mailto submit-mode
// decision, and the JSON payload shape for the optional Web3Forms-style
// endpoint. No DOM/canvas/network here on purpose — ContactForm.tsx is the
// only place that actually calls fetch()/location.href, so this file stays
// trivially unit-testable under happy-dom.

import type { ContactForm as ContactFormConfig } from '../types';

export interface ContactFormFields {
  email: string;
  subject: string;
  message: string;
}

export type ContactFormErrors = Partial<Record<keyof ContactFormFields, string>>;

export interface ContactFormValidation {
  ok: boolean;
  errors: ContactFormErrors;
}

/** Per-field character caps (also the maxLength the live inputs enforce). */
export const FIELD_CAPS = {
  email: 50,
  subject: 50,
  message: 300,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** Hard-cuts `value` to at most `max` characters — no ellipsis, matching a live char counter. */
export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Validates all three fields independently (no short-circuiting) so the
 * caller can surface every error at once rather than one at a time.
 */
export function validateForm(fields: ContactFormFields): ContactFormValidation {
  const errors: ContactFormErrors = {};

  const email = fields.email.trim();
  if (!email) {
    errors.email = 'Email is required.';
  } else if (email.length > FIELD_CAPS.email) {
    errors.email = `Email must be ${FIELD_CAPS.email} characters or fewer.`;
  } else if (!validateEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const subject = fields.subject.trim();
  if (!subject) {
    errors.subject = 'Subject is required.';
  } else if (subject.length > FIELD_CAPS.subject) {
    errors.subject = `Subject must be ${FIELD_CAPS.subject} characters or fewer.`;
  }

  const message = fields.message.trim();
  if (!message) {
    errors.message = 'Message is required.';
  } else if (message.length > FIELD_CAPS.message) {
    errors.message = `Message must be ${FIELD_CAPS.message} characters or fewer.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Builds a `mailto:` URL with the subject and body pre-filled and
 * URI-encoded (RFC 6068 — every reserved char, including space, must be
 * percent-encoded; `+` is not a safe stand-in for space here the way it is
 * in form-urlencoded bodies, so this deliberately does not use
 * URLSearchParams).
 */
export function buildMailto(mailtoAddr: string, fields: ContactFormFields): string {
  const body = `From: ${fields.email}\n\n${fields.message}`;
  const subject = encodeURIComponent(fields.subject);
  const encodedBody = encodeURIComponent(body);
  return `mailto:${mailtoAddr}?subject=${subject}&body=${encodedBody}`;
}

export type SubmitMode = 'endpoint' | 'mailto';

/**
 * Decides how the form should be delivered: POST to the configured endpoint
 * when one is set, otherwise fall back to a `mailto:` link. Pure — takes the
 * world data's `contact.form` config, not the message fields.
 */
export function chooseSubmitMode(form: Pick<ContactFormConfig, 'endpoint'>): SubmitMode {
  return form.endpoint.trim().length > 0 ? 'endpoint' : 'mailto';
}

/** Fixed sender label sent to the Web3Forms-style endpoint. */
export const ENDPOINT_FROM_NAME = 'Portfolio Contact';

export interface ContactEndpointPayload {
  access_key: string;
  from_name: string;
  email: string;
  subject: string;
  message: string;
}

/** Shapes the JSON body POSTed to `contact.form.endpoint`. */
export function buildEndpointPayload(accessKey: string, fields: ContactFormFields): ContactEndpointPayload {
  return {
    access_key: accessKey,
    from_name: ENDPOINT_FROM_NAME,
    email: fields.email,
    subject: fields.subject,
    message: fields.message,
  };
}

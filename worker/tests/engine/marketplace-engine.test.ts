import { describe, it, expect } from 'vitest';
import { toDiagnosisRecord } from '../../src/engine/marketplace-engine';
import { ExtractionResult, DiagnosisRecord } from '../../src/engine/types';

describe('toDiagnosisRecord', () => {
  it('should convert ExtractionResult to DiagnosisRecord', () => {
    const result: ExtractionResult = {
      ads: [
        {
          externalId: 'TEST-1',
          title: 'Test Ad',
          price: 100,
          url: 'https://example.com/1',
        },
      ],
      diagnosis: {
        pageType: 'CONTENT',
        url: 'https://example.com/search',
        finalUrl: 'https://example.com/search?q=test',
        title: 'Search Results',
        bodyLength: 15000,
        signals: {
          hasRecaptcha: false,
          hasHcaptcha: false,
          hasCloudflare: false,
          hasDatadome: false,
          hasLoginForm: false,
          hasLoginText: false,
          hasNoResultsMsg: false,
          hasSearchResults: true,
          hasCheckpoint: false,
          visibleElements: 200,
        },
        selectorUsed: '.item',
        screenshotPath: null,
      },
      metrics: {
        durationMs: 5000,
        authenticated: true,
        authSource: 'database',
        selectorUsed: '.item',
        adsRaw: 15,
        adsValid: 10,
        skippedReasons: { no_price: 3, price_below_min: 2 },
        scrollsDone: 3,
        retryAttempts: 0,
      },
    };

    const record = toDiagnosisRecord(result, 'standard');

    expect(record.pageType).toBe('CONTENT');
    expect(record.finalUrl).toBe('https://example.com/search?q=test');
    expect(record.selectorUsed).toBe('.item');
    expect(record.authenticated).toBe(true);
    expect(record.authSource).toBe('database');
    expect(record.adsRaw).toBe(15);
    expect(record.adsValid).toBe(10);
    expect(record.durationMs).toBe(5000);
    expect(record.bodyLength).toBe(15000);
    expect(record.antiDetection).toBe('standard');
    expect(record.skippedReasons).toEqual({ no_price: 3, price_below_min: 2 });
    expect(record.signals.recaptcha).toBe(false);
    expect(record.signals.loginRequired).toBe(false);
    expect(record.signals.noResults).toBe(false);
  });

  it('should handle LOGIN_REQUIRED page type', () => {
    const result: ExtractionResult = {
      ads: [],
      diagnosis: {
        pageType: 'LOGIN_REQUIRED',
        url: 'https://example.com/search',
        finalUrl: 'https://example.com/login',
        title: 'Login',
        bodyLength: 500,
        signals: {
          hasRecaptcha: false,
          hasHcaptcha: false,
          hasCloudflare: false,
          hasDatadome: false,
          hasLoginForm: true,
          hasLoginText: true,
          hasNoResultsMsg: false,
          hasSearchResults: false,
          hasCheckpoint: false,
          visibleElements: 10,
        },
        selectorUsed: null,
        screenshotPath: null,
      },
      metrics: {
        durationMs: 2000,
        authenticated: false,
        authSource: 'anonymous',
        selectorUsed: null,
        adsRaw: 0,
        adsValid: 0,
        skippedReasons: { error: 1 },
        scrollsDone: 0,
        retryAttempts: 0,
      },
    };

    const record = toDiagnosisRecord(result, 'minimal');

    expect(record.pageType).toBe('LOGIN_REQUIRED');
    expect(record.signals.loginRequired).toBe(true);
    expect(record.adsRaw).toBe(0);
    expect(record.adsValid).toBe(0);
    expect(record.authenticated).toBe(false);
  });

  it('should handle NO_RESULTS page type', () => {
    const result: ExtractionResult = {
      ads: [],
      diagnosis: {
        pageType: 'NO_RESULTS',
        url: 'https://example.com/search?q=xyz',
        finalUrl: 'https://example.com/search?q=xyz',
        title: 'No Results',
        bodyLength: 3000,
        signals: {
          hasRecaptcha: false,
          hasHcaptcha: false,
          hasCloudflare: false,
          hasDatadome: false,
          hasLoginForm: false,
          hasLoginText: false,
          hasNoResultsMsg: true,
          hasSearchResults: false,
          hasCheckpoint: false,
          visibleElements: 30,
        },
        selectorUsed: null,
        screenshotPath: null,
      },
      metrics: {
        durationMs: 3000,
        authenticated: true,
        authSource: 'database',
        selectorUsed: null,
        adsRaw: 0,
        adsValid: 0,
        skippedReasons: {},
        scrollsDone: 0,
        retryAttempts: 0,
      },
    };

    const record = toDiagnosisRecord(result, 'standard');

    expect(record.pageType).toBe('NO_RESULTS');
    expect(record.signals.noResults).toBe(true);
    expect(record.authenticated).toBe(true);
  });
});

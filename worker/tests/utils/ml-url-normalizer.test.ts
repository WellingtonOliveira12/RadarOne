import { describe, it, expect } from 'vitest';
import { stripMlHackSegments, hasMlHackSegments } from '../../src/utils/ml-url-normalizer';

describe('stripMlHackSegments', () => {
  it('removes _PublishedToday_YES at end of path', () => {
    const input = 'https://lista.mercadolivre.com.br/iphone-13_PublishedToday_YES';
    expect(stripMlHackSegments(input)).toBe('https://lista.mercadolivre.com.br/iphone-13');
  });

  it('removes combined _PublishedToday_YES and _NoIndex_True', () => {
    const input =
      'https://lista.mercadolivre.com.br/iphone-13_PublishedToday_YES_NoIndex_True';
    expect(stripMlHackSegments(input)).toBe('https://lista.mercadolivre.com.br/iphone-13');
  });

  it('preserves PriceRange when hack segment is mid-path', () => {
    const input =
      'https://lista.mercadolivre.com.br/iphone-13_PublishedToday_YES_PriceRange_1000-2000';
    expect(stripMlHackSegments(input)).toBe(
      'https://lista.mercadolivre.com.br/iphone-13_PriceRange_1000-2000'
    );
  });

  it('preserves query string', () => {
    const input =
      'https://lista.mercadolivre.com.br/iphone-13_PublishedToday_YES?sort=price';
    expect(stripMlHackSegments(input)).toBe(
      'https://lista.mercadolivre.com.br/iphone-13?sort=price'
    );
  });

  it('is idempotent', () => {
    const input = 'https://lista.mercadolivre.com.br/iphone-13_PublishedToday_YES';
    const once = stripMlHackSegments(input);
    const twice = stripMlHackSegments(once);
    expect(twice).toBe(once);
  });

  it('is a no-op on URLs without hack segments', () => {
    const input = 'https://lista.mercadolivre.com.br/iphone-13_PriceRange_1000-2000';
    expect(stripMlHackSegments(input)).toBe(input);
  });

  it('handles empty and undefined-like input', () => {
    expect(stripMlHackSegments('')).toBe('');
  });

  it('hasMlHackSegments detects presence', () => {
    expect(
      hasMlHackSegments('https://lista.mercadolivre.com.br/foo_PublishedToday_YES')
    ).toBe(true);
    expect(hasMlHackSegments('https://lista.mercadolivre.com.br/foo')).toBe(false);
  });
});

import { getUtf8ByteLength } from '@/utils/getUtf8ByteLength';

describe('getUtf8ByteLength', () => {
  it('counts ASCII text as one byte per character', () => {
    expect(getUtf8ByteLength('hello')).toBe(5);
  });

  it('counts empty string as zero bytes', () => {
    expect(getUtf8ByteLength('')).toBe(0);
  });

  it('counts multi-byte Unicode characters by their UTF-8 byte width', () => {
    // 'é' is 1 JS char / 1 code point but 2 UTF-8 bytes
    expect(getUtf8ByteLength('é')).toBe(2);
    expect('é'.length).toBe(1);
  });

  it('counts emoji by UTF-8 byte width, not JS .length or code point count', () => {
    // '😀' is a surrogate pair (JS .length === 2) but 1 code point and 4 UTF-8 bytes
    expect(getUtf8ByteLength('😀')).toBe(4);
    expect('😀'.length).toBe(2);
    expect([...'😀'].length).toBe(1);
  });

  it('encodes lone surrogates as the Unicode replacement character', () => {
    expect(getUtf8ByteLength('\uD800')).toBe(3);
    expect(getUtf8ByteLength('\uDC00')).toBe(3);
  });

  it('sums byte width across a mixed multiline body', () => {
    const body = 'hi\né😀\nbye';
    // h,i,\n = 3 bytes; é = 2 bytes; 😀 = 4 bytes; \n = 1 byte; b,y,e = 3 bytes
    expect(getUtf8ByteLength(body)).toBe(3 + 2 + 4 + 1 + 3);
  });
});

// =====================================================================
// textSplit.js – cutting text into pieces that can be spoken one at a
// time.
//
// Kept apart from speech.js because it is pure logic, so the tests can
// run it in Node.
//
// WHY PIECES: speech is generated one piece at a time, and piece 2 is
// requested while piece 1 is playing. The listener therefore waits for
// ONE short piece, not for the whole text. The first piece is smaller
// than the rest so that speech starts as soon as possible.
// =====================================================================

// Piece sizes, in characters.
export const FIRST_PIECE = 90;
export const NEXT_PIECE = 160;

function cut(sentence, limit) {
  // A single sentence longer than the limit: break it at spaces.
  const pieces = [];
  let current = '';

  for (const word of sentence.split(' ')) {
    if (current && (current + ' ' + word).length > limit) {
      pieces.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

// Split at sentence ends (including the Devanagari danda), then join
// sentences back together up to the piece size.
export function splitText(text) {
  const sentences = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?।॥]+[.!?।॥]*/g) || [];
  const pieces = [];
  let current = '';

  const limit = () => (pieces.length === 0 ? FIRST_PIECE : NEXT_PIECE);

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > limit()) {
      if (current) { pieces.push(current); current = ''; }
      pieces.push(...cut(sentence, limit()));
    } else if (current && (current + ' ' + sentence).length > limit()) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

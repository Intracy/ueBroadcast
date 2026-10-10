import { describe, expect, it } from 'vitest';
import { youtubeVideo } from '../web/src/components/LiveFrame';

describe('Live-Bild von YouTube', () => {
  it('erkennt Video und Startzeit aus allen üblichen Links für den Player', () => {
    expect(youtubeVideo('https://www.youtube.com/watch?v=tBhamFUoyJk&fs=1')).toEqual({
      id: 'tBhamFUoyJk',
      start: null,
    });
    expect(youtubeVideo('https://youtu.be/tBhamFUoyJk?t=90')).toEqual({ id: 'tBhamFUoyJk', start: 90 });
    expect(youtubeVideo('https://www.youtube.com/live/abcdefghijk')).toEqual({ id: 'abcdefghijk', start: null });
    expect(youtubeVideo('https://vdo.ninja/?view=x')).toBeNull();
    expect(youtubeVideo(null)).toBeNull();
    // Häufiger Tippfehler: zweites „?“ statt „&“
    expect(youtubeVideo('https://www.youtube.com/watch?v=tBhamFUoyJk?start=648&fs=1')).toEqual({
      id: 'tBhamFUoyJk',
      start: 648,
    });
  });
});

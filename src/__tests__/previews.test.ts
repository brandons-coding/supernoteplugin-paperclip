import {previewFile} from '../previews';

const DIR = '/data/plugin/paperclip';
const NOTE = '/storage/emulated/0/Note/Brain/work.note';

describe('previewFile', () => {
  it('gives each page its own file', () => {
    expect(previewFile(DIR, NOTE, 1, 100)).not.toBe(previewFile(DIR, NOTE, 2, 100));
  });

  it('is stable for the same inputs and changes with the stamp', () => {
    expect(previewFile(DIR, NOTE, 1, 100)).toBe(previewFile(DIR, NOTE, 1, 100));
    expect(previewFile(DIR, NOTE, 1, 100)).not.toBe(previewFile(DIR, NOTE, 1, 101));
  });

  it('keeps the notebook path out of the file name', () => {
    const file = previewFile(DIR, NOTE, 3, 100);

    expect(file.startsWith(`${DIR}/`)).toBe(true);
    expect(file.slice(DIR.length + 1)).not.toContain('/');
    expect(file).toMatch(/\.png$/);
  });
});

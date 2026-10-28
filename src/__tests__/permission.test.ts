import {PluginManager} from 'sn-plugin-lib';
import {Notice} from '../notice';
import {NOT_GRANTED, PERM_READ, ensurePermission} from '../sdk';

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {hasPermission: jest.fn(), requestPermission: jest.fn()},
  PluginCommAPI: {},
  PluginFileAPI: {},
  PluginNoteAPI: {},
  Element: {TYPE_TEXT: 500, TYPE_STROKE: 0},
}));

const has = PluginManager.hasPermission as jest.Mock;
const request = PluginManager.requestPermission as jest.Mock;

beforeEach(() => jest.resetAllMocks());

describe('ensurePermission', () => {
  it('does not ask when access is already there', async () => {
    has.mockResolvedValue(1);

    await ensurePermission(PERM_READ);

    expect(request).not.toHaveBeenCalled();
  });

  it('goes ahead once the re-check shows the grant', async () => {
    has.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    request.mockResolvedValue(2);

    await expect(ensurePermission(PERM_READ)).resolves.toBeUndefined();
  });

  // The first-run failure: the request let us through, the grant hadn't landed.
  it('stops with a plain message when the request says yes but access still is not there', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(1);

    const err = await ensurePermission(PERM_READ).catch(e => e);

    expect(err).toBeInstanceOf(Notice);
    expect(err.message).toBe(NOT_GRANTED);
    expect(err.detail).toContain('requestPermission answered 1, hasPermission after is 0');
  });

  it('gives the same message when the user cancels the dialog', async () => {
    has.mockResolvedValue(0);
    request.mockResolvedValue(-1);

    await expect(ensurePermission(PERM_READ)).rejects.toThrow(NOT_GRANTED);
  });
});

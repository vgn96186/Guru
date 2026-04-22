import * as samsungPerf from '../samsungPerf';

jest.mock('../../../modules/app-launcher', () => {
  const native = {
    init: jest.fn(),
    isSamsung: jest.fn(),
    startPreset: jest.fn(),
    startCustom: jest.fn(),
    stop: jest.fn(),
    stopAll: jest.fn(),
    shutdown: jest.fn(),
  };
  return {
    __esModule: true,
    default: {},
    samsungPerf: native,
    SamsungPerfPreset: { CPU: 0, GPU: 1, BUS: 2 },
    SamsungPerfCustomType: {},
    _native: native,
  };
});

jest.mock('expo-modules-core', () => {
  return {
    EventEmitter: class {
      addListener = jest.fn();
    },
  };
});

const { _native } = jest.requireMock('../../../modules/app-launcher') as {
  _native: {
    init: jest.Mock;
    startPreset: jest.Mock;
    stop: jest.Mock;
    stopAll: jest.Mock;
    shutdown: jest.Mock;
  };
};

describe('samsungPerf', () => {
  beforeEach(() => {
    samsungPerf.__resetForTests();
    _native.init.mockReset();
    _native.startPreset.mockReset();
    _native.stop.mockReset();
    _native.stopAll.mockReset();
    _native.shutdown.mockReset();
  });

  test('non-Samsung device → all calls resolve to -1 without touching native', async () => {
    _native.init.mockResolvedValue(false);
    await samsungPerf.init();
    expect(samsungPerf.isActive()).toBe(false);
    await expect(samsungPerf.acquire('llm_inference')).resolves.toBe(-1);
    expect(_native.startPreset).not.toHaveBeenCalled();
  });

  test('overlapping acquire() for same workload shares one boost', async () => {
    _native.init.mockResolvedValue(true);
    _native.startPreset.mockResolvedValue(42);
    await samsungPerf.init();

    const a = await samsungPerf.acquire('llm_inference');
    const b = await samsungPerf.acquire('llm_inference');
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(_native.startPreset).toHaveBeenCalledTimes(1);

    await samsungPerf.release('llm_inference');
    expect(_native.stop).not.toHaveBeenCalled(); // still one ref
    await samsungPerf.release('llm_inference');
    expect(_native.stop).toHaveBeenCalledWith(42);
  });

  test('runBoosted releases even when fn throws', async () => {
    _native.init.mockResolvedValue(true);
    _native.startPreset.mockResolvedValue(7);
    await samsungPerf.init();

    await expect(
      samsungPerf.runBoosted('whisper_transcription', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(_native.stop).toHaveBeenCalledWith(7);
  });
});

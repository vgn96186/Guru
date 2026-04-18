describe('ai generate compat module', () => {
  it('exports the legacy routing helpers', () => {
    const mod = require('./generate') as {
      generateJSONWithRouting?: unknown;
      generateTextWithRouting?: unknown;
      generateTextWithRoutingStream?: unknown;
    };

    expect(typeof mod.generateJSONWithRouting).toBe('function');
    expect(typeof mod.generateTextWithRouting).toBe('function');
    expect(typeof mod.generateTextWithRoutingStream).toBe('function');
  });
});

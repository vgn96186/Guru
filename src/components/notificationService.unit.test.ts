describe('notification service compat module', () => {
  it('exports the legacy dialog helpers', () => {
    const mod = require('./notificationService') as {
      showError?: unknown;
      showInfo?: unknown;
      showSuccess?: unknown;
      showWarning?: unknown;
      showToast?: unknown;
    };

    expect(typeof mod.showError).toBe('function');
    expect(typeof mod.showInfo).toBe('function');
    expect(typeof mod.showSuccess).toBe('function');
    expect(typeof mod.showWarning).toBe('function');
    expect(typeof mod.showToast).toBe('function');
  });
});

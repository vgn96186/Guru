import { Alert } from 'react-native';
import { __resetDialogServiceForTests, showDialog, showError } from './dialogService';

describe('dialogService fallback behavior', () => {
  beforeEach(() => {
    __resetDialogServiceForTests();
    jest.clearAllMocks();
  });

  it('falls back to native Alert.alert when no host is mounted', async () => {
    const resultPromise = showDialog({
      title: 'Leave session?',
      message: 'Your progress will be saved.',
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'secondary' },
        { id: 'leave', label: 'Leave', variant: 'destructive' },
      ],
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Leave session?',
      'Your progress will be saved.',
      expect.any(Array),
      expect.any(Object),
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as Array<{
      onPress?: () => void;
    }>;
    buttons[1]?.onPress?.();

    await expect(resultPromise).resolves.toBe('leave');
  });

  it('showError uses the same fallback path when no host is mounted', async () => {
    const resultPromise = showError(new Error('Boom'), 'Fallback message');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Something went wrong',
      'Boom',
      expect.any(Array),
      expect.any(Object),
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as Array<{
      onPress?: () => void;
    }>;
    buttons[0]?.onPress?.();

    await expect(resultPromise).resolves.toBe('ok');
  });
});

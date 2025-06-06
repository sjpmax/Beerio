// utils/uiHelpers.ts
import { Platform, Alert } from 'react-native';

// Cross-platform alert function
export const showAlert = (title: string, message?: string, buttons?: any[]) => {
  if (Platform.OS === 'web') {
    // Web fallback using browser alerts
    if (buttons && buttons.length > 1) {
      const result = window.confirm(`${title}\n\n${message}`);
      if (result && buttons[1]?.onPress) {
        buttons[1].onPress();
      } else if (!result && buttons[0]?.onPress) {
        buttons[0].onPress();
      }
    } else {
      window.alert(`${title}\n\n${message}`);
      if (buttons?.[0]?.onPress) {
        buttons[0].onPress();
      }
    }
  } else {
    // Mobile - use React Native Alert
    Alert.alert(title, message, buttons);
  }
};

// Success banner timeout helper
export const showSuccessThenReset = (
  setSuccessState: (value: string) => void,
  resetForm: () => void,
  delay: number = 500
) => {
  setTimeout(() => {
    resetForm();
    setSuccessState('');
  }, delay);
};

// Loading button text helper
export const getLoadingText = (isLoading: boolean, defaultText: string, loadingText: string) => {
  return isLoading ? loadingText : defaultText;
};

// Common success alert for submissions
export const showSubmissionSuccess = (
  itemName: string,
  itemType: 'Beer' | 'Bar',
  onAddAnother: () => void,
  onGoBack: () => void
) => {
  const emoji = itemType === 'Beer' ? '🍺' : '🍺';
  showAlert(
    `${emoji} ${itemType} Submitted!`,
    `${itemName} has been submitted for review!\n\nAdmins will review it soon and it'll appear in the main list once approved.`,
    [
      {
        text: `Add Another ${itemType}`,
        style: 'default',
        onPress: onAddAnother
      },
      {
        text: itemType === 'Beer' ? 'Back to Main' : 'Back to Add Beer',
        style: 'default',
        onPress: onGoBack
      }
    ]
  );
};
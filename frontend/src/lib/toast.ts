import toast from 'react-hot-toast';

export function showSuccess(message: string) {
  toast.success(message, {
    duration: 4000,
    position: 'top-right',
  });
}

export function showError(message: string) {
  toast.error(message, {
    duration: 5000,
    position: 'top-right',
  });
}

export function showInfo(message: string) {
  toast(message, {
    duration: 3000,
    position: 'top-right',
    icon: 'ℹ️',
  });
}

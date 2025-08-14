
export const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        boxWidth: 12,
        font: { size: 10 }
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { font: { size: 10 } }
    },
    x: {
      ticks: { font: { size: 10 } }
    }
  }
};

const styles = getComputedStyle(document.documentElement);
export const chartColors = {
  primary: styles.getPropertyValue('--primary-color').trim(),
  success: styles.getPropertyValue('--success-color').trim(),
  warning: styles.getPropertyValue('--warning-color').trim(),
  error: styles.getPropertyValue('--error-color').trim(),
  danger: styles.getPropertyValue('--error-color').trim()
};

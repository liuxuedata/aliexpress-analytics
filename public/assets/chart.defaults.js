
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

export const chartColors = {
  primary: 'rgb(59, 130, 246)',
  secondary: 'rgb(156, 163, 175)',
  success: 'rgb(16, 185, 129)',
  danger: 'rgb(239, 68, 68)',
  warning: 'rgb(245, 158, 11)',
  purple: 'rgb(147, 51, 234)'
};

import React from 'react';
import { ToggleButtonGroup, ToggleButton, Box } from '@mui/material';
import { TimeRange } from '../../types/performance';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (timeRange: TimeRange) => void;
  disabled?: boolean;
}

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: '1D', label: '1D' },
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '1Y', label: '1Y' },
  { value: 'ALL', label: 'ALL' }
];

export const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const handleChange = (_event: React.MouseEvent<HTMLElement>, newValue: TimeRange | null) => {
    if (newValue !== null) {
      onChange(newValue);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={handleChange}
        aria-label="time range selector"
        size="small"
        disabled={disabled}
      >
        {timeRangeOptions.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            aria-label={option.label}
            sx={{
              px: 2,
              py: 0.5,
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
};

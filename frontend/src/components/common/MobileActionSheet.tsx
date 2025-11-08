import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  IconButton,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export interface ActionSheetAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  color?: 'default' | 'primary' | 'error' | 'warning' | 'success';
  disabled?: boolean;
}

interface MobileActionSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
}

/**
 * Mobile-optimized action sheet component
 * Provides a bottom drawer with touch-friendly action buttons
 */
export const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  open,
  onClose,
  title,
  actions,
}) => {
  const handleActionClick = (action: ActionSheetAction) => {
    action.onClick();
    onClose();
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '80vh',
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        {title && (
          <>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1,
              }}
            >
              <Typography variant="h6">{title}</Typography>
              <IconButton onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
            <Divider sx={{ mb: 2 }} />
          </>
        )}

        <List sx={{ pt: 0 }}>
          {actions.map((action, index) => (
            <React.Fragment key={index}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => handleActionClick(action)}
                  disabled={action.disabled}
                  sx={{
                    minHeight: 56,
                    borderRadius: 1,
                    mb: 0.5,
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  {action.icon && (
                    <ListItemIcon
                      sx={{
                        color:
                          action.color === 'error'
                            ? 'error.main'
                            : action.color === 'primary'
                            ? 'primary.main'
                            : action.color === 'warning'
                            ? 'warning.main'
                            : action.color === 'success'
                            ? 'success.main'
                            : 'inherit',
                      }}
                    >
                      {action.icon}
                    </ListItemIcon>
                  )}
                  <ListItemText
                    primary={action.label}
                    primaryTypographyProps={{
                      color:
                        action.color === 'error'
                          ? 'error.main'
                          : action.color === 'primary'
                          ? 'primary.main'
                          : action.color === 'warning'
                          ? 'warning.main'
                          : action.color === 'success'
                          ? 'success.main'
                          : 'inherit',
                      fontWeight: 500,
                    }}
                  />
                </ListItemButton>
              </ListItem>
              {index < actions.length - 1 && <Divider variant="middle" />}
            </React.Fragment>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

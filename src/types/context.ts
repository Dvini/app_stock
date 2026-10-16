/**
 * React context type definitions
 */

import { ReactNode } from 'react';

/**
 * Theme values
 */
export type Theme = 'light' | 'dark';

/**
 * ThemeContext value
 */
export interface ThemeContextValue {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

/**
 * ThemeProvider props
 */
export interface ThemeProviderProps {
    children: ReactNode;
}

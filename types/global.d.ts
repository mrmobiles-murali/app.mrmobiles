export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          start_param?: string;
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
          };
        };
        colorScheme: "light" | "dark";
        themeParams?: {
          bg_color?: string;
          secondary_bg_color?: string;
          text_color?: string;
          hint_color?: string;
          button_color?: string;
          button_text_color?: string;
          section_bg_color?: string;
          section_separator_color?: string;
        };
        viewportStableHeight?: number;
        onEvent?(eventType: "themeChanged" | "viewportChanged", callback: () => void): void;
        offEvent?(eventType: "themeChanged" | "viewportChanged", callback: () => void): void;
        ready(): void;
        expand(): void;
        setHeaderColor(color: string): void;
        setBackgroundColor(color: string): void;
        setBottomBarColor?(color: string): void;
        requestFullscreen?(): void;
        enableClosingConfirmation(): void;
        showAlert(message: string): void;
        MainButton?: {
          setText(text: string): void;
          show(): void;
          hide(): void;
          enable(): void;
          disable(): void;
          onClick(callback: () => void): void;
          offClick(callback: () => void): void;
        };
        BackButton?: {
          show(): void;
          hide(): void;
          onClick(callback: () => void): void;
          offClick(callback: () => void): void;
        };
        HapticFeedback?: {
          impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
          notificationOccurred(type: "error" | "success" | "warning"): void;
          selectionChanged(): void;
        };
      };
    };
    Razorpay?: new (options: Record<string, unknown>) => {
      open(): void;
      on(event: string, callback: (response: any) => void): void;
    };
  }
}

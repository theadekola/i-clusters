declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: {
      wsProtocols?: string[];
      credentials?: {password: string};
    });
    scaleViewport: boolean;
    clipboardPasteFrom(text: string): void;
    disconnect(): void;
    focus(): void;
  }
}

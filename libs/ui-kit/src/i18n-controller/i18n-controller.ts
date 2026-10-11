import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { TTranslator } from '@konvoez/client-shell';

export class I18nController implements ReactiveController {
  private unsubscribe?: () => void;
  private translator?: TTranslator;

  constructor(
    private readonly host: ReactiveControllerHost,
    translator?: TTranslator,
  ) {
    this.translator = translator;
    this.host.addController(this);
  }

  public setTranslator(translator: TTranslator | undefined): void {
    if (this.translator === translator) {
      return;
    }
    this.unsubscribe?.();
    this.translator = translator;
    if (this.translator) {
      this.unsubscribe = this.translator.subscribe(() => {
        this.host.requestUpdate();
      });
    }
    this.host.requestUpdate();
  }

  public hostConnected(): void {
    this.unsubscribe?.();
    if (this.translator) {
      this.unsubscribe = this.translator.subscribe(() => {
        this.host.requestUpdate();
      });
    }
  }

  public hostDisconnected(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  public t(key: string, vars?: Record<string, string>): string {
    return this.translator ? this.translator.t(key, vars) : key;
  }
}

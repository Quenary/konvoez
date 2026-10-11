import { css } from 'lit';

export const tokens = css`
  :host {
    --tui-background-base: #ffffff;
    --tui-background-base-alt: #f6f7f8;
    --tui-background-elevation-1: #ffffff;
    --tui-background-neutral-1: #244a7f0f;
    --tui-background-neutral-1-hover: #244a7f17;
    --tui-background-accent-1: #ffdd2d;
    --tui-background-accent-1-hover: #ffcd33;
    --tui-text-primary: #000000cc;
    --tui-text-secondary: #0000008a;
    --tui-text-tertiary: #00000066;
    --tui-text-primary-on-accent-1: #333333;
    --tui-text-negative: #f52222;
    --tui-text-positive: #00a328;
    --tui-status-negative: #f52222;
    --tui-border-normal: #0010241f;
    --tui-border-focus: #00102470;
    --tui-radius-m: 0.75rem;
    --tui-radius-l: 1rem;
    --tui-height-m: 2.75rem;
    --tui-font-text: 'Manrope', system-ui, sans-serif;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --tui-background-base: #202020;
      --tui-background-base-alt: #202020;
      --tui-background-elevation-1: #292929;
      --tui-background-neutral-1: #ffffff1a;
      --tui-background-neutral-1-hover: #ffffff26;
      --tui-background-accent-1: #ffdd2d;
      --tui-background-accent-1-hover: #ffcd33;
      --tui-text-primary: #ffffffe6;
      --tui-text-secondary: #ffffffb3;
      --tui-text-tertiary: #ffffff80;
      --tui-text-primary-on-accent-1: #333333;
      --tui-text-negative: #ff4d4d;
      --tui-text-positive: #00e037;
      --tui-status-negative: #cd2324;
      --tui-border-normal: #ffffff26;
      --tui-border-focus: #ffffff;
    }
  }
`;

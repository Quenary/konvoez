/** Validated minimal WASM SIMD probe (v128.const). */
const WASM_SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

export function isSimdSupported(): boolean {
  try {
    return (
      typeof WebAssembly !== 'undefined' &&
      typeof WebAssembly.validate === 'function' &&
      WebAssembly.validate(WASM_SIMD_PROBE)
    );
  } catch {
    return false;
  }
}

export function isMobileOrIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };

  if (typeof nav.userAgentData?.mobile === 'boolean') {
    if (nav.userAgentData.mobile) {
      return true;
    }
  }

  const userAgent = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) {
    return true;
  }

  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) {
    return true;
  }

  return false;
}

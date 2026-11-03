#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

/// Translates a Windows Virtual-Key code and extended flag to a W3C `KeyboardEvent.code` string.
pub fn windows_vk_to_code(vk: u32, extended: bool) -> Option<&'static str> {
    match vk {
        // Letters A-Z
        0x41 => Some("KeyA"),
        0x42 => Some("KeyB"),
        0x43 => Some("KeyC"),
        0x44 => Some("KeyD"),
        0x45 => Some("KeyE"),
        0x46 => Some("KeyF"),
        0x47 => Some("KeyG"),
        0x48 => Some("KeyH"),
        0x49 => Some("KeyI"),
        0x4A => Some("KeyJ"),
        0x4B => Some("KeyK"),
        0x4C => Some("KeyL"),
        0x4D => Some("KeyM"),
        0x4E => Some("KeyN"),
        0x4F => Some("KeyO"),
        0x50 => Some("KeyP"),
        0x51 => Some("KeyQ"),
        0x52 => Some("KeyR"),
        0x53 => Some("KeyS"),
        0x54 => Some("KeyT"),
        0x55 => Some("KeyU"),
        0x56 => Some("KeyV"),
        0x57 => Some("KeyW"),
        0x58 => Some("KeyX"),
        0x59 => Some("KeyY"),
        0x5A => Some("KeyZ"),

        // Digits 0-9
        0x30 => Some("Digit0"),
        0x31 => Some("Digit1"),
        0x32 => Some("Digit2"),
        0x33 => Some("Digit3"),
        0x34 => Some("Digit4"),
        0x35 => Some("Digit5"),
        0x36 => Some("Digit6"),
        0x37 => Some("Digit7"),
        0x38 => Some("Digit8"),
        0x39 => Some("Digit9"),

        // Function keys F1-F24
        0x70 => Some("F1"),
        0x71 => Some("F2"),
        0x72 => Some("F3"),
        0x73 => Some("F4"),
        0x74 => Some("F5"),
        0x75 => Some("F6"),
        0x76 => Some("F7"),
        0x77 => Some("F8"),
        0x78 => Some("F9"),
        0x79 => Some("F10"),
        0x7A => Some("F11"),
        0x7B => Some("F12"),
        0x7C => Some("F13"),
        0x7D => Some("F14"),
        0x7E => Some("F15"),
        0x7F => Some("F16"),
        0x80 => Some("F17"),
        0x81 => Some("F18"),
        0x82 => Some("F19"),
        0x83 => Some("F20"),
        0x84 => Some("F21"),
        0x85 => Some("F22"),
        0x86 => Some("F23"),
        0x87 => Some("F24"),

        // Modifiers
        0x10 => Some("ShiftLeft"),
        0xA0 => Some("ShiftLeft"),
        0xA1 => Some("ShiftRight"),
        0x11 => {
            if extended {
                Some("ControlRight")
            } else {
                Some("ControlLeft")
            }
        }
        0xA2 => Some("ControlLeft"),
        0xA3 => Some("ControlRight"),
        0x12 => {
            if extended {
                Some("AltRight")
            } else {
                Some("AltLeft")
            }
        }
        0xA4 => Some("AltLeft"),
        0xA5 => Some("AltRight"),
        0x5B => Some("MetaLeft"),
        0x5C => Some("MetaRight"),

        // Navigation & Editing
        0x1B => Some("Escape"),
        0x0D => {
            if extended {
                Some("NumpadEnter")
            } else {
                Some("Enter")
            }
        }
        0x09 => Some("Tab"),
        0x20 => Some("Space"),
        0x08 => Some("Backspace"),
        0x2E => Some("Delete"),
        0x2D => Some("Insert"),
        0x24 => Some("Home"),
        0x23 => Some("End"),
        0x21 => Some("PageUp"),
        0x22 => Some("PageDown"),
        0x26 => Some("ArrowUp"),
        0x28 => Some("ArrowDown"),
        0x25 => Some("ArrowLeft"),
        0x27 => Some("ArrowRight"),

        // Locks & Controls
        0x14 => Some("CapsLock"),
        0x90 => Some("NumLock"),
        0x91 => Some("ScrollLock"),
        0x2C => Some("PrintScreen"),
        0x13 => Some("Pause"),
        0x5D => Some("ContextMenu"),

        // Numpad
        0x60 => Some("Numpad0"),
        0x61 => Some("Numpad1"),
        0x62 => Some("Numpad2"),
        0x63 => Some("Numpad3"),
        0x64 => Some("Numpad4"),
        0x65 => Some("Numpad5"),
        0x66 => Some("Numpad6"),
        0x67 => Some("Numpad7"),
        0x68 => Some("Numpad8"),
        0x69 => Some("Numpad9"),
        0x6A => Some("NumpadMultiply"),
        0x6B => Some("NumpadAdd"),
        0x6D => Some("NumpadSubtract"),
        0x6E => Some("NumpadDecimal"),
        0x6F => Some("NumpadDivide"),

        // OEM / Symbols
        0xBD => Some("Minus"),
        0xBB => Some("Equal"),
        0xDB => Some("BracketLeft"),
        0xDD => Some("BracketRight"),
        0xDC => Some("Backslash"),
        0xBA => Some("Semicolon"),
        0xDE => Some("Quote"),
        0xC0 => Some("Backquote"),
        0xBC => Some("Comma"),
        0xBE => Some("Period"),
        0xBF => Some("Slash"),

        _ => None,
    }
}

/// Translates an X11 (evdev+8) keycode to a W3C `KeyboardEvent.code` string.
pub fn x11_keycode_to_code(keycode: u8) -> Option<&'static str> {
    match keycode {
        9 => Some("Escape"),
        10 => Some("Digit1"),
        11 => Some("Digit2"),
        12 => Some("Digit3"),
        13 => Some("Digit4"),
        14 => Some("Digit5"),
        15 => Some("Digit6"),
        16 => Some("Digit7"),
        17 => Some("Digit8"),
        18 => Some("Digit9"),
        19 => Some("Digit0"),
        20 => Some("Minus"),
        21 => Some("Equal"),
        22 => Some("Backspace"),
        23 => Some("Tab"),
        24 => Some("KeyQ"),
        25 => Some("KeyW"),
        26 => Some("KeyE"),
        27 => Some("KeyR"),
        28 => Some("KeyT"),
        29 => Some("KeyY"),
        30 => Some("KeyU"),
        31 => Some("KeyI"),
        32 => Some("KeyO"),
        33 => Some("KeyP"),
        34 => Some("BracketLeft"),
        35 => Some("BracketRight"),
        36 => Some("Enter"),
        37 => Some("ControlLeft"),
        38 => Some("KeyA"),
        39 => Some("KeyS"),
        40 => Some("KeyD"),
        41 => Some("KeyF"),
        42 => Some("KeyG"),
        43 => Some("KeyH"),
        44 => Some("KeyJ"),
        45 => Some("KeyK"),
        46 => Some("KeyL"),
        47 => Some("Semicolon"),
        48 => Some("Quote"),
        49 => Some("Backquote"),
        50 => Some("ShiftLeft"),
        51 => Some("Backslash"),
        52 => Some("KeyZ"),
        53 => Some("KeyX"),
        54 => Some("KeyC"),
        55 => Some("KeyV"),
        56 => Some("KeyB"),
        57 => Some("KeyN"),
        58 => Some("KeyM"),
        59 => Some("Comma"),
        60 => Some("Period"),
        61 => Some("Slash"),
        62 => Some("ShiftRight"),
        63 => Some("NumpadMultiply"),
        64 => Some("AltLeft"),
        65 => Some("Space"),
        66 => Some("CapsLock"),
        67 => Some("F1"),
        68 => Some("F2"),
        69 => Some("F3"),
        70 => Some("F4"),
        71 => Some("F5"),
        72 => Some("F6"),
        73 => Some("F7"),
        74 => Some("F8"),
        75 => Some("F9"),
        76 => Some("F10"),
        77 => Some("NumLock"),
        78 => Some("ScrollLock"),
        79 => Some("Numpad7"),
        80 => Some("Numpad8"),
        81 => Some("Numpad9"),
        82 => Some("NumpadSubtract"),
        83 => Some("Numpad4"),
        84 => Some("Numpad5"),
        85 => Some("Numpad6"),
        86 => Some("NumpadAdd"),
        87 => Some("Numpad1"),
        88 => Some("Numpad2"),
        89 => Some("Numpad3"),
        90 => Some("Numpad0"),
        91 => Some("NumpadDecimal"),
        95 => Some("F11"),
        96 => Some("F12"),
        104 => Some("NumpadEnter"),
        105 => Some("ControlRight"),
        106 => Some("NumpadDivide"),
        107 => Some("PrintScreen"),
        108 => Some("AltRight"),
        110 => Some("Home"),
        111 => Some("ArrowUp"),
        112 => Some("PageUp"),
        113 => Some("ArrowLeft"),
        114 => Some("ArrowRight"),
        115 => Some("End"),
        116 => Some("ArrowDown"),
        117 => Some("PageDown"),
        118 => Some("Insert"),
        119 => Some("Delete"),
        127 => Some("Pause"),
        133 => Some("MetaLeft"),
        134 => Some("MetaRight"),
        135 => Some("ContextMenu"),
        191 => Some("F13"),
        192 => Some("F14"),
        193 => Some("F15"),
        194 => Some("F16"),
        195 => Some("F17"),
        196 => Some("F18"),
        197 => Some("F19"),
        198 => Some("F20"),
        199 => Some("F21"),
        200 => Some("F22"),
        201 => Some("F23"),
        202 => Some("F24"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_windows_vk_mapping() {
        assert_eq!(windows_vk_to_code(0x41, false), Some("KeyA"));
        assert_eq!(windows_vk_to_code(0x5A, false), Some("KeyZ"));
        assert_eq!(windows_vk_to_code(0x30, false), Some("Digit0"));
        assert_eq!(windows_vk_to_code(0x70, false), Some("F1"));
        assert_eq!(windows_vk_to_code(0x7B, false), Some("F12"));
        assert_eq!(windows_vk_to_code(0x87, false), Some("F24"));
        assert_eq!(windows_vk_to_code(0x11, false), Some("ControlLeft"));
        assert_eq!(windows_vk_to_code(0x11, true), Some("ControlRight"));
        assert_eq!(windows_vk_to_code(0x12, false), Some("AltLeft"));
        assert_eq!(windows_vk_to_code(0x12, true), Some("AltRight"));
        assert_eq!(windows_vk_to_code(0x10, false), Some("ShiftLeft"));
        assert_eq!(windows_vk_to_code(0x5B, false), Some("MetaLeft"));
        assert_eq!(windows_vk_to_code(0x0D, false), Some("Enter"));
        assert_eq!(windows_vk_to_code(0x0D, true), Some("NumpadEnter"));
        assert_eq!(windows_vk_to_code(0x20, false), Some("Space"));
        assert_eq!(windows_vk_to_code(0x1B, false), Some("Escape"));
        assert_eq!(windows_vk_to_code(0xFFFA, false), None);
    }

    #[test]
    fn test_x11_keycode_mapping() {
        assert_eq!(x11_keycode_to_code(9), Some("Escape"));
        assert_eq!(x11_keycode_to_code(38), Some("KeyA"));
        assert_eq!(x11_keycode_to_code(52), Some("KeyZ"));
        assert_eq!(x11_keycode_to_code(19), Some("Digit0"));
        assert_eq!(x11_keycode_to_code(67), Some("F1"));
        assert_eq!(x11_keycode_to_code(96), Some("F12"));
        assert_eq!(x11_keycode_to_code(37), Some("ControlLeft"));
        assert_eq!(x11_keycode_to_code(105), Some("ControlRight"));
        assert_eq!(x11_keycode_to_code(64), Some("AltLeft"));
        assert_eq!(x11_keycode_to_code(108), Some("AltRight"));
        assert_eq!(x11_keycode_to_code(50), Some("ShiftLeft"));
        assert_eq!(x11_keycode_to_code(62), Some("ShiftRight"));
        assert_eq!(x11_keycode_to_code(133), Some("MetaLeft"));
        assert_eq!(x11_keycode_to_code(36), Some("Enter"));
        assert_eq!(x11_keycode_to_code(104), Some("NumpadEnter"));
        assert_eq!(x11_keycode_to_code(65), Some("Space"));
        assert_eq!(x11_keycode_to_code(255), None);
    }
}

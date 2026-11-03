use napi::bindgen_prelude::*;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread::JoinHandle;

pub fn is_supported() -> bool {
    false
}

pub fn start_hook(_callback: Function, _stopper: Arc<AtomicBool>) -> Result<JoinHandle<()>> {
    Err(Error::new(
        Status::GenericFailure,
        "Linux key hook not enabled yet".to_string(),
    ))
}
